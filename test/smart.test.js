// ✨ Chytré hledání (public/js/smart.js): české věty → nastavení hledání letů, místa z vět s koncovkami.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const c = { window: {}, console };
vm.createContext(c);
vm.runInContext(readFileSync(new URL('../public/js/searchhelp.js', import.meta.url), 'utf8'), c);
vm.runInContext(readFileSync(new URL('../public/js/smart.js', import.meta.url), 'utf8'), c);
const { Smart, SearchHelp: H } = c.window;
const today = '2026-10-18'; // neděle
const presets = { weekend: { nMin: 1, nMax: 3, out: [4, 5, 6], back: [0, 1] }, long: { nMin: 3, nMax: 5, out: [3, 4, 5], back: [0, 1, 2] }, week: { nMin: 5, nMax: 9, out: [], back: [] }, '2weeks': { nMin: 11, nMax: 16, out: [], back: [] } };
const P = (q, t = today) => JSON.parse(JSON.stringify(Smart.parse(q, { today: t, presets, holidays: H.holidayList(t), holidayDates: H.holidayDates })));
const chips = (r) => r.chips.map((x) => x.text);

test('k moři v květnu do 5000 na týden: regiony u moře podle měsíce, termín, délka a cena', () => {
  const r = P('k moři v květnu do 5000 na týden');
  assert.deepEqual(chips(r), ['k moři', 'květen', 'týden', 'do 5 000 Kč']);
  assert.deepEqual(r.items.map((x) => x.id), ['rg:kreta', 'rg:kypr', 'rg:turecka-riviera', 'rg:baleary']);
  assert.deepEqual(r.patch, { maxPrice: '5000', len: 'week', nMin: 5, nMax: 9, outDays: [], backDays: [], dateMode: 'flex', dFrom: '2027-05-01', dTo: '2027-05-31' });
  assert.deepEqual(r.to, []);
  // v zimě k moři tam, kde je teplo i v zimě
  assert.deepEqual(P('u moře v lednu').items.map((x) => x.id), ['rg:kanary', 'rg:egypt-more', 'rg:madeira']);
  // bez diakritiky stejně
  assert.deepEqual(chips(P('k mori v kvetnu do 5 000 kc')), ['k moři', 'květen', 'do 5 000 Kč']);
});

test('místa ve větě: odkud (z …) a kam, víc míst, jméno moře je místo', () => {
  const r = P('z Vídně do Barcelony 12. 11. - 16. 11.');
  assert.deepEqual([r.from, r.to], [['Vídně'], ['Barcelony']]);
  assert.deepEqual([r.patch.dateMode, r.patch.xOut, r.patch.xBack], ['exact', '2026-11-12', '2026-11-16']);
  assert.deepEqual(P('Itálie a Řecko v létě, přímý let, s kufrem').to, ['Itálie', 'Řecko']);
  const rm = P('Rudé moře o Vánocích');
  assert.deepEqual(rm.to, ['Rudé moře']);
  assert.equal(rm.kind, null, '„moře“ v Rudé moře není „k moři“');
  assert.equal(rm.patch.len, 'holiday');
  assert.equal(P('Baltimore').kind, null);
  assert.deepEqual(P('Baltimore').chips, []);
});

test('termíny: víkendy, svátky, měsíce, roční období, relativně, konkrétní dny', () => {
  const w = P('Londýn tento víkend');
  assert.deepEqual([w.patch.len, w.patch.dFrom, w.patch.dTo, w.patch.outDays], ['weekend', '2026-10-18', '2026-10-24', [4, 5, 6]]);
  assert.deepEqual([P('příští měsíc').patch.dFrom, P('příští měsíc').patch.dTo], ['2026-11-01', '2026-11-30']);
  assert.deepEqual([P('v létě').patch.dFrom, P('v létě').patch.dTo], ['2027-06-01', '2027-08-31']);
  assert.deepEqual([P('na podzim').patch.dFrom, P('na podzim').patch.dTo], ['2026-10-18', '2026-11-30'], 'podzim už běží – od dneška');
  assert.deepEqual([P('v zimě').patch.dFrom, P('v zimě').patch.dTo], ['2026-12-01', '2027-02-28']);
  const d = P('od 3.–10. 6.');
  assert.deepEqual([d.patch.xOut, d.patch.xBack], ['2027-06-03', '2027-06-10']);
  const one = P('15. 5. na 4 noci do Madridu');
  assert.deepEqual([one.patch.xOut, one.patch.xBack, one.to], ['2027-05-15', '2027-05-19', ['Madridu']]);
  const ow = P('Paříž 15.5. jen tam');
  assert.deepEqual([ow.patch.trip, ow.patch.xOut, ow.patch.xBack], ['oneway', '2027-05-15', undefined]);
  assert.deepEqual([P('co nejdřív').patch.dFrom, P('co nejdřív').patch.dTo], ['2026-10-18', '2026-11-01']);
});

test('délka, lidé, cena, zavazadla, přímé lety, druh cíle', () => {
  assert.deepEqual(P('na 5 nocí').patch.nMin, 5);
  assert.deepEqual([P('na 3 dny').patch.nMin, P('na 3 dny').patch.nMax], [2, 2]);
  assert.equal(P('na 2 týdny').patch.len, '2weeks');
  assert.equal(P('prodloužený víkend').patch.len, 'long');
  assert.equal(P('ve dvou').patch.adults, 2);
  assert.equal(P('pro 3 lidi').patch.adults, 3);
  assert.equal(P('s přítelkyní').patch.adults, 2);
  assert.equal(P('do 8 tisíc').patch.maxPrice, '8000');
  assert.equal(P('za 3 dny').patch.maxPrice, undefined, '„za 3 dny“ není cena');
  assert.equal(P('do 5000 2 lidi').patch.maxPrice, '5000');
  assert.equal(P('s kabinovým kufrem').patch.bags, 'cabin');
  assert.equal(P('s kufrem').patch.bags, 'checked');
  assert.equal(P('bez přestupu').patch.directOnly, true);
  assert.equal(P('za teplem').patch.minTemp, 20);
  assert.equal(P('do horka').patch.minTemp, 25);
  assert.deepEqual(P('exotika').items.map((x) => x.id), ['cc:TH', 'cc:ID', 'cc:VN', 'cc:AE', 'cc:LK']);
  assert.deepEqual(P('na hory').items.map((x) => x.id), ['ap:INN', 'ap:SZG', 'ap:GVA', 'ap:TRN']);
  assert.equal(P('kamkoliv').kind, 'any');
  // děti platí letenku: dospělí + děti; bez počtu dospělých dva
  assert.equal(P('2 dospělí a 2 děti k moři').patch.adults, 4);
  assert.equal(P('s dítětem do Říma').patch.adults, 3);
  assert.equal(P('na jih').patch.minTemp, 20);
});

test('za týden / za 14 dní = kdy odletět (ne délka pobytu)', () => {
  const w = P('za týden někam');
  assert.deepEqual([w.patch.dFrom, w.patch.dTo, w.patch.len], ['2026-10-22', '2026-10-29', undefined]);
  const d = P('za 14 dní do Londýna na 3 noci');
  assert.deepEqual([d.patch.dFrom, d.patch.dTo, d.patch.nMin, d.to], ['2026-10-29', '2026-11-05', 3, ['Londýna']]);
});

test('místa s koncovkami: tvary slova a nejlepší návrh (země a oblasti před náhodnými místy)', () => {
  assert.deepEqual([...Smart.stems('Vídně')], ['Vídně', 'Vídn', 'Víd']);
  assert.deepEqual([...Smart.stems('Ří')], ['Ří']);
  const best = (list) => Smart.bestPlace(list)?.id;
  assert.equal(best([
    { q: 'Vídně', items: [{ id: 'geo:42.8,18.4|Vidne', label: 'Vidne', type: 'place' }] },
    { q: 'Vídn', items: [{ id: 'geo:55.5,37.7|Vidnoye', label: 'Vidnoye', type: 'city' }] },
    { q: 'Víd', items: [{ id: 'ap:VIE', label: 'Vídeň', type: 'airport' }, { id: 'geo:48.2,16.3|Vídeň', label: 'Vídeň', type: 'city' }] },
  ]), 'ap:VIE');
  assert.equal(best([{ q: 'Itálie', items: [{ id: 'geo:42.8,12.8|Itálie', label: 'Itálie', type: 'city' }, { id: 'cc:IT', label: 'Itálie', type: 'country' }] }]), 'cc:IT');
  assert.equal(best([{ q: 'Říma', items: [{ id: 'ap:RMT', label: 'Rimatara', type: 'airport' }] }, { q: 'Řím', items: [{ id: 'metro:ROM', label: 'Řím', type: 'metro' }] }]), 'metro:ROM');
  assert.equal(best([{ q: 'Rudé moře', items: [{ id: 'rg:egypt-more', label: 'Rudé moře (Egypt)', type: 'region' }] }]), 'rg:egypt-more');
  assert.equal(best([{ q: 'xyz', items: [{ id: 'ap:AAA', label: 'Abc', type: 'airport' }] }]), undefined);
  // celé slovo přesně (bez diakritiky) před zkráceným tvarem: „Malaga“ je Málaga, ne Malajsie z „Mala“
  assert.equal(best([
    { q: 'Malaga', items: [{ id: 'ap:AGP', label: 'Málaga', type: 'airport' }] },
    { q: 'Malag', items: [{ id: 'ap:AGP', label: 'Málaga', type: 'airport' }] },
    { q: 'Mala', items: [{ id: 'cc:MY', label: 'Malajsie', type: 'country' }, { id: 'ap:AGP', label: 'Málaga', type: 'airport' }] },
  ]), 'ap:AGP');
});

test('Objevuj: věta → místo, druh plánu, dny, km, od kdy, zájmy; základní tvar jména místa', () => {
  const X = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today })));
  assert.deepEqual(X('Lisabon na 3 dny'), { place: 'Lisabon', mode: null, days: 3, km: null, start: null, interests: [], chips: ['📅 3 dny'] });
  assert.deepEqual([X('výlety z Brna').place, X('výlety z Brna').mode], ['Brna', 'day']);
  assert.deepEqual([X('Krakov pěšky 10 km').mode, X('Krakov pěšky 10 km').km], ['hike', 10]);
  assert.deepEqual([X('na kole kolem Vídně 40 km').mode, X('na kole kolem Vídně 40 km').place], ['bike', 'Vídně'], '„kolem“ = okolo, ne na kole');
  assert.deepEqual([X('okruh po Toskánsku na týden').mode, X('okruh po Toskánsku na týden').days, X('okruh po Toskánsku na týden').place], ['loop', 7, 'Toskánsku']);
  assert.deepEqual([X('Řím s dětmi od 15. 5.').start, X('Řím s dětmi od 15. 5.').interests], ['2027-05-15', ['kids']]);
  assert.deepEqual(X('Praha').chips, []);
  const N = (p) => [...Smart.nominatives(p)];
  assert.ok(N('Brna').includes('Brno'));
  assert.ok(N('Prahy').includes('Praha'));
  assert.ok(N('Vídně').includes('Vídeň'));
  assert.ok(N('Lisabonu').includes('Lisabon'));
  assert.ok(N('Krétu').includes('Kréta'));
  assert.ok(N('Toskánsku').includes('Toskánsko'));
  assert.ok(N('Brně').includes('Brno'));
  assert.equal(N('Lisabon')[0], 'Lisabon', 'původní tvar první');
});

test('ukázkové věty na Přehledu (podle ročního období) se rozumí celé – nic nezbyde jako cíl', () => {
  for (const [q, kind] of [['na hory v lednu na lyže', 'mountains'], ['na hory v červenci na týden', 'mountains'], ['za teplem v prosinci na týden', 'warm'], ['k moři v srpnu do 5000', 'sea']]) {
    const r = P(q);
    assert.equal(r.kind, kind, q);
    assert.deepEqual(r.to || [], [], q);
    assert.ok(r.patch.dFrom, q);
  }
});

test('přirozené věty: „s dětmi“, „něco teplého“, „v Alpách“, šipka odkud → kam – nic z toho není cíl', () => {
  const t1 = P('Tenerife s dětmi v únoru');
  assert.deepEqual(t1.to, ['Tenerife']);
  assert.ok(t1.chips.some((c) => /s dětmi/.test(c.text)));
  assert.deepEqual(P('k moři s dětmi v červenci').to, []);
  // s počtem osob bez připomínky
  assert.ok(!P('Split pro 4 s dětmi').chips.some((c) => /s dětmi/.test(c.text)));
  const w = P('něco teplého na Vánoce');
  assert.equal(w.kind, 'warm');
  assert.deepEqual(w.to, []);
  assert.deepEqual(P('kde je teplo v lednu').to, []);
  // Teplice nejsou „teplo“
  assert.deepEqual([P('z Teplic do Londýna').kind, P('z Teplic do Londýna').from], [null, ['Teplic']]);
  assert.deepEqual([P('lyže v Alpách v lednu').kind, P('lyže v Alpách v lednu').to], ['mountains', []]);
  assert.deepEqual([P('Vídeň → Nice v listopadu').from, P('Vídeň → Nice v listopadu').to], [['Vídeň'], ['Nice']]);
  assert.deepEqual([P('Praha -> Řím -> Barcelona').from, P('Praha -> Řím -> Barcelona').to], [['Praha'], ['Řím', 'Barcelona']]);
});

test('termín slovy: „20. listopadu“, „od 3. do 7. prosince“, začátek/polovina/konec měsíce, „v pátek“', () => {
  const a = P('do Neapole 20. listopadu');
  assert.deepEqual([a.to, a.patch.dateMode, a.patch.xOut], [['Neapole'], 'exact', '2026-11-20']);
  const b = P('Milán od 3. do 7. prosince');
  assert.deepEqual([b.patch.xOut, b.patch.xBack], ['2026-12-03', '2026-12-07']);
  assert.deepEqual([P('3.–7. prosince Vídeň').patch.xOut, P('3.–7. prosince Vídeň').to], ['2026-12-03', ['Vídeň']]);
  const c = P('Malaga konec listopadu');
  assert.deepEqual([c.to, c.patch.dFrom, c.patch.dTo], [['Malaga'], '2026-11-20', '2026-11-30']);
  assert.deepEqual([P('Kodaň začátkem prosince').patch.dFrom, P('Kodaň začátkem prosince').patch.dTo], ['2026-12-01', '2026-12-10']);
  assert.deepEqual([P('Itálie v polovině listopadu').patch.dFrom, P('Itálie v polovině listopadu').patch.dTo], ['2026-11-10', '2026-11-20']);
  const d = P('Madrid v pátek');
  assert.deepEqual([d.to, d.patch.outDays], [['Madrid'], [5]]);
  assert.deepEqual(P('Turecko all inclusive').to, ['Turecko']);
});

test('nejlepší návrh i podle jiného názvu ze serveru: en („Rome“) a aliases („Toscana“)', () => {
  const best = (list) => Smart.bestPlace(list)?.id;
  assert.equal(best([{ q: 'Rome', items: [{ id: 'metro:ROM', label: 'Řím', en: 'Rome', type: 'metro' }] }]), 'metro:ROM');
  assert.equal(best([{ q: 'Toscana', items: [{ id: 'geo:43.4,11.1|Toskánské ostrovy', label: 'Toskánské ostrovy', type: 'place' }, { id: 'rg:toskansko', label: 'Toskánsko', aliases: ['toskansko', 'toscana'], type: 'region' }] }]), 'rg:toskansko');
});

test('svátky slovy: Velikonoce (i bez seznamu svátků), státní svátek, jarní/podzimní prázdniny, Valentýn', () => {
  const e = (t) => { const r = JSON.parse(JSON.stringify(Smart.parse('Řím o Velikonocích', { today: t }))); return [r.to, r.patch.dFrom, r.patch.dTo, r.patch.len]; };
  // Velikonoční neděle 28. 3. 2027, 16. 4. 2028; odlet čt–pá před ní
  assert.deepEqual(e('2026-10-18'), [['Řím'], '2027-03-25', '2027-03-26', 'long']);
  assert.deepEqual(e('2027-04-10').slice(1, 3), ['2028-04-13', '2028-04-14']);
  // seznam prodloužených víkendů: nejbližší
  assert.equal(P('na státní svátek').chips[0].text, 'Den boje za svobodu');
  assert.deepEqual([P('na jarní prázdniny').patch.dFrom, P('na jarní prázdniny').patch.dTo], ['2027-02-01', '2027-03-20']);
  assert.deepEqual([P('podzimní prázdniny do Londýna').patch.dFrom, P('podzimní prázdniny do Londýna').to], ['2026-10-24', ['Londýna']]);
  assert.deepEqual([P('Paříž na Valentýna').patch.dFrom, P('Paříž na Valentýna').patch.dTo, P('Paříž na Valentýna').to], ['2027-02-12', '2027-02-14', ['Paříž']]);
  // letní prázdniny dál jako léto
  assert.equal(P('o prázdninách k moři').chips.find((c) => c.icon === '📅').text, 'prázdniny');
});

test('víc šipek = cesta přes víc měst (chain): odkud a místa v pořadí; jedna šipka nebo „k moři“ ne', () => {
  const r = P('Praha → Řím → Barcelona → Praha 10. 11. – 17. 11.');
  assert.deepEqual([r.chain, r.from, r.to, r.patch.xOut, r.patch.xBack], [true, ['Praha'], ['Řím', 'Barcelona', 'Praha'], '2026-11-10', '2026-11-17']);
  assert.equal(P('Vídeň → Nice').chain, undefined);
  assert.equal(P('Praha -> Lisabon -> Porto ve dvou').chain, true);
});

test('Objevuj: otázky kolem místa („co vidět v Římě“, „okolí Olomouce“) – místo bez slov otázky', () => {
  const X = (q) => JSON.parse(JSON.stringify(Smart.parseExplore(q, { today })));
  assert.equal(X('co vidět v Římě').place, 'Římě');
  assert.equal(X('Řím co navštívit').place, 'Řím');
  assert.deepEqual([X('co dělat v Londýně s dětmi').place, X('co dělat v Londýně s dětmi').interests], ['Londýně', ['kids']]);
  assert.deepEqual([X('okolí Olomouce').place, X('okolí Olomouce').mode], ['Olomouce', 'day']);
  assert.equal(X('zajímavosti Krakova').place, 'Krakova');
});

test('pomlčka mezi místy = odkud → kam („Praha - Londýn“); bez cíle za ní („Řím – víkend“) je to cíl; data a Baden-Baden ne', () => {
  assert.deepEqual([P('Praha - Londýn').from, P('Praha - Londýn').to], [['Praha'], ['Londýn']]);
  const r = P('Praha–Londýn 3.12.');
  assert.deepEqual([r.from, r.to, r.patch.xOut], [['Praha'], ['Londýn'], '2026-12-03']);
  assert.deepEqual([P('Řím – víkend ve dvou').from, P('Řím – víkend ve dvou').to], [[], ['Řím']]);
  assert.equal(P('Praha - Řím - Barcelona - Praha').chain, true);
  assert.deepEqual(P('Baden-Baden').to, ['Baden-Baden']);
  assert.deepEqual([P('3.–7. 6. Řím').to, P('3.–7. 6. Řím').patch.xBack], [['Řím'], '2027-06-07']);
});

test('dny odletu a návratu slovy („od pátku do neděle“, „čt–ne“) a zavazadla „bez kufru“', () => {
  const r = P('Lisabon od pátku do neděle');
  assert.deepEqual([r.to, r.patch.outDays, r.patch.backDays, r.patch.nMin, r.patch.nMax, r.patch.len], [['Lisabon'], [5], [0], 2, 2, 'custom']);
  assert.deepEqual(chips(r), ['pátek → neděle', '2 noci']);
  assert.deepEqual([P('čt-ne Paříž').patch.outDays, P('čt-ne Paříž').patch.backDays, P('čt-ne Paříž').to], [[4], [0], ['Paříž']]);
  // „po do …“ bez pomlčky není rozsah dnů
  assert.equal(P('z Brna po do Londýna').patch.outDays, undefined);
  assert.deepEqual([P('bez kufru').patch.bags, P('bez kufru').to], ['none', []]);
  assert.equal(P('jen s malým batohem').patch.bags, 'none');
  assert.equal(P('s velkým kufrem').patch.bags, 'checked');
});

test('účel cesty a „levně“ nejsou místa; vánoční trhy = advent', () => {
  assert.deepEqual(P('na svatbu do Milána 5.12.').to, ['Milána']);
  assert.deepEqual(P('Madeira za pár korun').to, ['Madeira']);
  assert.deepEqual(P('za babku do Londýna').to, ['Londýna']);
  assert.deepEqual(P('s batohem do Asie').to, ['Asie']);
  assert.deepEqual(P('co nejlevněji').to, []);
  const t = P('na vánoční trhy do Vídně');
  assert.deepEqual([t.to, t.patch.dFrom, t.patch.dTo, chips(t)], [['Vídně'], '2026-11-27', '2026-12-21', ['vánoční trhy']]);
});

test('polární záře = letiště za polárním kruhem a Island (i „za polární září“ – to není září); safari, kultura, sever, autem nejsou místa', () => {
  const r = P('za polární září v lednu na 4 noci');
  assert.deepEqual([r.kind, r.items.map((x) => x.id), chips(r)], ['aurora', ['ap:TOS', 'ap:RVN', 'ap:KTT', 'ap:KEF'], ['polární záře', 'leden', '4 noci']]);
  assert.deepEqual(P('safari v Keni').to, ['Keni']);
  assert.deepEqual(P('kam za kulturou').to, []);
  assert.deepEqual(P('sever Španělska').to, ['Španělska']);
  assert.deepEqual(P('Portugalsko autem').to, ['Portugalsko']);
  assert.deepEqual(P('Severní Irsko').to, ['Severní Irsko']);
});

test('přesné datum s délkou: návrat dopočtený a vidět v čipu; mezi svátky, „a dítě“, lyžovačka, letní/zimní, zájezd a pobyt nejsou místa', () => {
  const r = P('Řím 3 noci od 5.12.');
  assert.deepEqual([r.patch.xOut, r.patch.xBack, chips(r)], ['2026-12-05', '2026-12-08', ['5. 12. – 8. 12.']]);
  assert.deepEqual(chips(P('na prodloužený víkend 28. října')), ['28. 10. – 1. 11.']);
  assert.deepEqual(chips(P('Paříž 5.12. jen tam')), ['5. 12.', 'jen tam']);
  const m = P('mezi svátky na hory');
  assert.deepEqual([m.kind, m.patch.dFrom, m.patch.dTo, chips(m)], ['mountains', '2026-12-26', '2026-12-30', ['na hory', 'mezi svátky']]);
  assert.deepEqual([P('dva dospělí a dítě do Barcelony').patch.adults, P('dva dospělí a dítě do Barcelony').to], [3, ['Barcelony']]);
  assert.deepEqual([P('lyžovačka v Rakousku').kind, P('lyžovačka v Rakousku').to], ['mountains', ['Rakousku']]);
  assert.deepEqual([chips(P('letní dovolená Řecko')), P('letní dovolená Řecko').to], [['léto'], ['Řecko']]);
  assert.deepEqual(P('zájezd Chorvatsko').to, ['Chorvatsko']);
  assert.deepEqual(P('pobyt u moře září').to, []);
});

test('„od pátku“ = den odletu (ne místo odletu), den z věty přednost před dny délky; „ne“ není místo', () => {
  const r = P('od pátku do Říma');
  assert.deepEqual([r.from, r.to, r.patch.outDays, chips(r)], [[], ['Říma'], [5], ['odlet v pátek']]);
  const w = P('od soboty na týden do Paříže');
  assert.deepEqual([w.patch.outDays, w.patch.len, w.patch.nMin, w.patch.nMax], [[6], 'week', 5, 9]);
  assert.deepEqual([P('v sobotu na víkend').patch.outDays, P('v sobotu na víkend').patch.backDays], [[6], [0, 1]]);
  assert.deepEqual(P('Řím na víkend').patch.outDays, [4, 5, 6]);
  assert.deepEqual(P('v pátek na 3 noci').patch.outDays, [5]);
  assert.deepEqual(P('ne do Říma').to, ['Říma']);
});
