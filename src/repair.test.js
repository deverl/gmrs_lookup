'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { repair, normalize } = require('./repair');

const chief = 'HD|5194381|0011731276||WSJY732|A|ZA|09/09/2025|09/09/2035||||||||||N||||||||||N||Jason|E|Taylor||CEO | JET MEDICAL RESPONSE||||||||09/09/2025|09/09/2025|||||||||||||||';
const owner = 'HD|5106548|0011484742||WSHM478|A|ZA|03/15/2025|03/15/2035||||||||||N||||||||||N||Raymond|P|Cooper||||owner||||||||03/15/2025|03/15/2025|||||||||||||||';
const seay = 'EN|5280832|||WSMI342|L|L03027358|Seay |Jr, Keith B|Keith|B|Seay||Jr||||2167 Hickory St|Mabank|TX|75156|||000|0038215604|I||||||';
const cooper = 'EN|5106548|||WSHM478|L|L02913113|Cooper ||, Raymond P|Raymond|P|Cooper|||||||54 Frenchton Rd|French Creek|WV|26218||Raymond P Cooper|||000|0036794170|I||||||';
const vazquez = 'EN|5199189|||WSKB634|L|L02971658|Vazquez, Christian J|Christian|J|Vazquez|||||3206 Florenze Way|Saint Cloud|FL|34772||||000|0037502531|I||||||';

function fields(line) {
  return line.split('|');
}

test('header pipes in a title fold back into one field', () => {
  const chiefFields = repair(fields(chief), 'header', 1);
  assert.equal(chiefFields.length, 59);
  assert.equal(chiefFields[4], 'WSJY732');
  assert.equal(chiefFields[5], 'A');
  assert.equal(chiefFields[34], 'CEO / JET MEDICAL RESPONSE');
  assert.equal(chiefFields[42], '09/09/2025');

  const ownerFields = repair(fields(owner), 'header', 2);
  assert.equal(ownerFields.length, 59);
  assert.equal(ownerFields[4], 'WSHM478');
  assert.equal(ownerFields[34], 'owner');
  assert.equal(ownerFields[42], '03/15/2025');
});

test('entity pipes keep the name, address, and FRN', () => {
  const seayFields = repair(fields(seay), 'entity', 1);
  assert.equal(seayFields.length, 30);
  assert.equal(seayFields[4], 'WSMI342');
  assert.equal(seayFields[7], 'Seay / Jr, Keith B');
  assert.equal(seayFields[8], 'Keith');
  assert.equal(seayFields[10], 'Seay');
  assert.equal(seayFields[11], 'Jr');
  assert.equal(seayFields[15], '2167 Hickory St');
  assert.equal(seayFields[16], 'Mabank');
  assert.equal(seayFields[17], 'TX');
  assert.equal(seayFields[22], '0038215604');

  const cooperFields = repair(fields(cooper), 'entity', 2);
  assert.equal(cooperFields.length, 30);
  assert.equal(cooperFields[7], 'Cooper / , Raymond P');
  assert.equal(cooperFields[8], 'Raymond');
  assert.equal(cooperFields[10], 'Cooper');
  assert.equal(cooperFields[15], '54 Frenchton Rd');
  assert.equal(cooperFields[17], 'WV');
  assert.equal(cooperFields[20], 'Raymond P Cooper');
  assert.equal(cooperFields[22], '0036794170');

  const vazquezFields = repair(fields(vazquez), 'entity', 3);
  assert.equal(vazquezFields.length, 30);
  assert.equal(vazquezFields[8], 'Christian');
  assert.equal(vazquezFields[10], 'Vazquez');
  assert.equal(vazquezFields[16], 'Saint Cloud');
  assert.equal(vazquezFields[17], 'FL');
  assert.equal(vazquezFields[22], '0037502531');
});

test('normalize rewrites a file so every row has the expected columns', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmrs-radio-lookup-repair-'));
  const file = path.join(dir, 'HD.dat');
  const good = Array.from({ length: 59 }, () => '');
  good[0] = 'HD';
  good[4] = 'WQBQ753';
  good[6] = 'ZA';
  fs.writeFileSync(file, `${good.join('|')}\r\n${chief}\r\n`);
  await normalize(file, 'header');
  const lines = fs.readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');
  assert.equal(lines.length, 2);
  assert.equal(lines[0].split('|').length, 59);
  assert.equal(lines[1].split('|').length, 59);
  assert.equal(lines[1].split('|')[34], 'CEO / JET MEDICAL RESPONSE');
  assert.ok(!fs.readFileSync(file, 'utf8').includes('\r'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a row that cannot be realigned is rejected', () => {
  assert.throws(() => repair(['HD', 'not-a-license'], 'header', 9), /line 9/);
});
