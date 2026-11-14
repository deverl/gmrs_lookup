'use strict';

const fs = require('fs');
const path = require('path');

/// A few GMRS rows contain a `|` inside a name or title. That character is also
/// the column separator, so the row arrives with more fields than the table.
/// Those pieces are joined with " / " so the row has the expected number of columns.

function unreadable(line) {
  const error = new Error(`The GMRS license file has a row that could not be read (line ${line}).`);
  error.databaseReplaced = false;
  return error;
}

function splitLines(text) {
  const lines = text.split(/\r\n|\n|\r|\u2028|\u2029/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function fold(pieces) {
  return pieces.map((piece) => piece.trim()).filter((piece) => piece.length > 0).join(' / ');
}

function isDateOrEmpty(value) {
  return value === '' || /^\d{2}\/\d{2}\/\d{4}$/.test(value);
}

function lastStateIndex(middle) {
  if (middle.length < 2) return -1;
  let found = -1;
  for (let index = 0; index < middle.length - 1; index += 1) {
    if (/^[A-Z]{2}$/.test(middle[index]) && /^\d{5}(?:\d{4})?$/.test(middle[index + 1])) {
      found = index;
    }
  }
  return found;
}

function repairHeader(fields, line) {
  if (fields.length === 59) return fields;
  const prefixCount = 34;
  const suffixCount = 17;
  if (fields.length <= prefixCount + suffixCount || fields[0] !== 'HD' || fields[6] !== 'ZA') {
    throw unreadable(line);
  }
  const prefix = fields.slice(0, prefixCount);
  const suffix = fields.slice(-suffixCount);
  if (!isDateOrEmpty(suffix[0]) || !isDateOrEmpty(suffix[1])) throw unreadable(line);
  const middle = fields.slice(prefixCount, fields.length - suffixCount);
  const extra = middle.length - 8;
  if (extra <= 0 || middle.length < extra + 1) throw unreadable(line);
  const title = fold(middle.slice(0, extra + 1));
  const rest = middle.slice(extra + 1);
  if (rest.length !== 7) throw unreadable(line);
  const rebuilt = prefix.concat([title], rest, suffix);
  if (rebuilt.length !== 59) throw unreadable(line);
  return rebuilt;
}

function repairEntity(fields, line) {
  if (fields.length === 30) return fields;
  const frn = fields.length >= 8 ? fields[fields.length - 8] : '';
  if (fields.length <= 30 || fields[0] !== 'EN' || !/^\d{10}$/.test(frn)) throw unreadable(line);
  const prefix = fields.slice(0, 7);
  const suffix = fields.slice(-8);
  const middle = fields.slice(7, fields.length - 8);
  const stateIndex = lastStateIndex(middle);
  if (stateIndex < 2) throw unreadable(line);
  const streetIndex = stateIndex - 2;
  const before = middle.slice(0, streetIndex);
  const address = middle.slice(streetIndex, stateIndex + 2);
  let after = middle.slice(stateIndex + 2);
  if (before.length < 8) throw unreadable(line);

  let extra = before.length - 8;
  const name = [before[0]];
  const rest = before.slice(1);
  while (extra > 0 && rest.length) {
    const next = rest[0];
    const previous = name[name.length - 1];
    const continues = previous.endsWith(' ') || previous === ''
      || next.startsWith(' ') || next.startsWith(',') || next === '';
    if (!continues) break;
    name.push(rest.shift());
    extra -= 1;
  }
  while (extra > 0 && rest.length - 1 >= 7) {
    const empty = rest.indexOf('');
    if (empty < 0) break;
    rest.splice(empty, 1);
    extra -= 1;
  }
  if (extra !== 0 || rest.length !== 7) throw unreadable(line);

  if (after.length > 3) {
    const sgin = after[after.length - 1];
    if (sgin && /^\d+$/.test(sgin)) {
      const text = after.slice(0, -1).filter((piece) => piece !== '');
      if (text.length > 1) throw unreadable(line);
      after = ['', text[0] || '', sgin];
    } else {
      while (after.length > 3) {
        const empty = after.indexOf('');
        if (empty < 0) break;
        after.splice(empty, 1);
      }
    }
  }
  while (after.length < 3) after.push('');
  if (after.length !== 3) throw unreadable(line);

  const rebuilt = prefix.concat([fold(name)], rest, address, after, suffix);
  if (rebuilt.length !== 30 || !/^[A-Z]{2}$/.test(rebuilt[17]) || !/^\d{10}$/.test(rebuilt[22])) {
    throw unreadable(line);
  }
  return rebuilt;
}

function repair(fields, kind, line) {
  if (kind === 'header') return repairHeader(fields, line);
  if (kind === 'entity') return repairEntity(fields, line);
  throw unreadable(line);
}

async function normalize(file, kind) {
  const text = await fs.promises.readFile(file, 'utf8');
  const lines = splitLines(text);
  const expected = kind === 'header' ? 59 : 30;
  let changed = false;
  for (let index = 0; index < lines.length; index += 1) {
    const fields = lines[index].split('|');
    if (fields.length === expected) continue;
    lines[index] = repair(fields, kind, index + 1).join('|');
    changed = true;
  }
  if (!changed) return;
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.repairing`);
  await fs.promises.writeFile(temporary, `${lines.join('\n')}\n`, 'utf8');
  try {
    await fs.promises.rename(temporary, file);
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM') {
      await fs.promises.rm(temporary, { force: true });
      throw error;
    }
    await fs.promises.rm(file, { force: true });
    await fs.promises.rename(temporary, file);
  }
}

module.exports = {
  normalize,
  repair,
};
