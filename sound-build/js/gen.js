/* 구조 생성기 — 영어 문장을 넣으면 문장구조(뼈대 + 부품 표시) 기호를 자동으로 만든다.
   SB.analyze('The boy in the red cap ran.') → 'The <boy> n(in the red cap) {ran}.'
   기호는 mark.js 와 같다: {동사} <명사> *형용사*, 전치사구 = 자리( … ), 절 = 자리[ … ], 자리 n 명사 뒤 · j 형용사 뒤 · v 동사 · s 문장.
   사전 + 자리 규칙으로 고르는 방식이라 틀릴 수 있다 → 화면에서 고칠 수 있게 한다. */
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};
  function S(s) { var o = {}; s.split(/\s+/).forEach(function (w) { if (w) o[w] = 1; }); return o; }

  /* ── 사전 ── */
  var DET = S('a an the this that these those my your his her its our their some any no every each all both either neither another such much many few several little more most less least enough whose whatever what which one two three four five six seven eight nine ten eleven twelve twenty thirty hundred thousand million first second third last next other own same certain half');
  var PRON = S('i you he she it we they me him us them myself yourself himself herself itself ourselves yourselves themselves mine yours ours theirs hers someone somebody something anyone anybody anything everyone everybody everything nobody nothing none');
  var PRON_SUBJ = S('i he she we they');
  var PRON_POST = S('someone somebody something anyone anybody anything everyone everybody everything nobody nothing those one all some many most none each few');
  var PREP = S('about above across after against along amid among around as at before behind below beneath beside besides between beyond by despite down during except for from in inside into like near of off on onto out outside over past per since than through throughout till to toward towards under underneath unlike until up upon via with within without');
  var PREP2 = ['because of', 'according to', 'in front of', 'instead of', 'out of', 'due to', 'thanks to', 'next to', 'such as', 'as for', 'in spite of', 'on top of', 'away from', 'apart from', 'ahead of', 'in addition to', 'close to', 'up to', 'along with', 'together with', 'in the middle of', 'as well as'];
  var SUB = S('when while if because although though since as before after until till unless once whereas whenever wherever lest whether');
  var SUB2 = ['as soon as', 'so that', 'even if', 'even though', 'even as', 'as if', 'as though', 'in order that', 'now that', 'as long as', 'provided that', 'by the time', 'in case', 'every time', 'the moment', 'just as', 'ever since', 'only if', 'not until'];
  var SUB_ONLY = S('when while if because although though unless whereas whenever wherever once lest whether');
  var COORD = S('and but or nor yet');
  var REL = S('who whom whose which that');
  var REL_ADV_NOUN = S('place places time times day days year years house home room city town country village school moment reason reasons way night week month morning evening summer winter spring age era period world situation case point spot street area land office station park restaurant hospital church garden island');
  var WHQ = S('who whom which what whose when where why how whether if whatever whoever whichever wherever whenever however');
  var MODAL = S('can could may might must shall should will would');
  var BE = S('am is are was were be been being');
  var HAVE = S('have has had having');
  var DO = S('do does did');
  var NEG = S('not never');
  var ADV = S('very so too also always never often sometimes usually already still just even ever not quite rather really almost here there now then today tonight yesterday tomorrow soon again away back together once twice yet only perhaps maybe probably certainly finally suddenly actually especially simply nearly hardly seldom rarely else instead later ago abroad indeed anyway thus therefore however otherwise forever everywhere somewhere nowhere anywhere upstairs downstairs outside inside home far fast hard well much more most less least enough alone almost little lately recently');
  var NOT_LY = S('family only early lovely friendly lonely ugly silly holy likely unlikely elderly daily weekly monthly yearly july reply supply apply fly rely ally belly jelly bully italy lily sally holly rally lively costly deadly curly chilly smelly jolly woolly hilly');
  var ADJ = S('good bad big small large little long short tall high low old young new great happy sad angry glad sorry afraid alone alive asleep awake aware sure certain able unable free full empty easy hard difficult simple strong weak hot cold warm cool dark bright light heavy rich poor nice kind cute pretty beautiful ugly clean dirty quiet loud fast slow quick early late busy ready right wrong true false real important necessary possible impossible different similar same special famous popular strange proud honest brave smart clever wise stupid silly funny serious safe dangerous sick ill healthy hungry thirsty tired sleepy lonely lovely friendly deep wide narrow thick thin sweet sour bitter fresh wet dry soft red blue green yellow black white brown gray grey pink purple orange golden whole main common public private political social national natural human general local personal final major minor modern ancient huge tiny fine fair likely unlikely responsible worth mistaken interested excited surprised married worried pleased bored scared satisfied disappointed confused ashamed amazed shocked frightened embarrassed determined crowded qualified experienced characteristic obvious clear due fond jealous capable guilty innocent nervous curious anxious eager open close near upset okay ok favorite magic fun wild calm gentle polite rude lazy fat slim cheap expensive single double total perfect pure rare round square flat sharp smooth rough loose tight broad vast deaf blind dead dear grand brief silent violent ill familiar similar particular regular popular difficult excellent different important intelligent patient present absent ancient convenient efficient sufficient independent confident innocent permanent silent recent frequent apparent evident decent elegant pleasant relevant significant brilliant distant constant abundant arrogant vacant interesting exciting boring amazing surprising tiring charming confusing disappointing frightening shocking pleasing relaxing satisfying touching annoying embarrassing missing willing loving caring outstanding promising');
  var ADJ_ING = S('interesting exciting boring amazing surprising tiring charming confusing disappointing frightening shocking pleasing relaxing satisfying touching annoying embarrassing missing willing loving caring outstanding promising');
  var NOUN_ING = S('thing things nothing something anything everything morning mornings evening evenings ceiling king kings ring rings wing wings string strings spring sing during wedding building buildings meeting meetings feeling feelings painting paintings beginning ending pudding sibling siblings darling earring duckling lightning offspring');
  var NOT_ADJ_SUF = S('table cable vegetable olive detective motive objective relative native comic music logic traffic topic clinic public fish dish wish');
  // 동사 원형 (규칙 · 불규칙). 활용형은 아래 lemma() 가 원형으로 되돌린다.
  var VB = S('be have do go come get make take give see know think say tell find feel leave bring buy catch teach fight seek begin break choose drive eat fall fly forget grow hide ride rise run sing sink speak steal swim throw wake wear write draw drink show blow sell send spend build lend bend keep sleep sweep meet lead feed hold stand understand sit lose win hang dig stick strike swing shine shoot lay pay hear mean read put cut hit let set shut cost hurt quit spread beat bite forgive freeze shake mistake light slide spin tear bear swear lie arise become overcome withdraw ' +
    'accept accuse achieve act add admire admit advise afford agree allow announce answer appear apply arrange arrive ask attack attend avoid bake bark behave believe belong borrow bother breathe brush burn call care carry cause celebrate change chase cheat check cheer chew clean clear climb close collect comb compare complain complete consider contain continue cook copy correct cough count cover crash crawl cross cry dance decide declare decorate deliver depend describe deserve destroy develop die disagree disappear discover dislike divide doubt drag dream dress drop earn educate encourage end enjoy enter escape examine excite exercise exist expect explain explore express fail fasten fear fetch fill finish fit fix float flow fold follow force form gather glance glide grab greet guess guide hammer hand handle happen hate head heal help hope hug hunt hurry identify ignore imagine improve include increase influence inform insist intend interest introduce invent invite join joke judge jump kick kill kiss knock land last laugh learn lift like listen live look love manage march mark marry match matter measure melt mention mind miss move nod note notice obey observe obtain offer open order own pack paint park pass pause perform pick place plan plant play please point pour practice practise pray prefer prepare present press pretend prevent print produce promise protect prove provide pull punish push question race rain reach realize realise receive recognize recommend reduce refuse regret relax remain remember remind remove repair repeat replace reply report request rescue respect rest return rob roll rub rule rush sail save scream search seem serve settle share shout sign sit skip smell smile smoke snow solve sound spell stare start stay step stop store study succeed suffer suggest supply support suppose surprise surround survive taste talk thank touch train travel treat trust try turn type use visit wait walk wander want warn wash waste watch wave weigh welcome whisper wish wonder work worry yell soar notice own belong wait watch exclaim sigh gaze nap stroll tremble shiver giggle pretend glide stick');
  var IRR = {};
  ('was:be were:be been:be am:be is:be are:be being:be has:have had:have does:do did:do done:do went:go gone:go came:come got:get gotten:get made:make took:take taken:take gave:give given:give saw:see seen:see knew:know known:know thought:think said:say told:tell found:find felt:feel left:leave brought:bring bought:buy caught:catch taught:teach fought:fight sought:seek began:begin begun:begin broke:break broken:break chose:choose chosen:choose drove:drive driven:drive ate:eat eaten:eat fell:fall fallen:fall flew:fly flown:fly forgot:forget forgotten:forget grew:grow grown:grow hid:hide hidden:hide rode:ride ridden:ride rose:rise risen:rise ran:run sang:sing sung:sing sank:sink sunk:sink spoke:speak spoken:speak stole:steal stolen:steal swam:swim swum:swim threw:throw thrown:throw woke:wake woken:wake wore:wear worn:wear wrote:write written:write drew:draw drawn:draw drank:drink drunk:drink shown:show blew:blow blown:blow sold:sell sent:send spent:spend built:build lent:lend bent:bend kept:keep slept:sleep swept:sweep met:meet led:lead fed:feed held:hold stood:stand understood:understand sat:sit lost:lose won:win hung:hang dug:dig stuck:stick struck:strike swung:swing shone:shine shot:shoot laid:lay paid:pay heard:hear meant:mean beaten:beat bit:bite bitten:bite forgave:forgive forgiven:forgive froze:freeze frozen:freeze shook:shake shaken:shake mistook:mistake mistaken:mistake lit:light slid:slide spun:spin tore:tear torn:tear bore:bear born:bear borne:bear swore:swear sworn:swear lay:lie lain:lie arose:arise arisen:arise became:become overcame:overcome withdrew:withdraw')
    .split(' ').forEach(function (p) { var a = p.split(':'); IRR[a[0]] = a[1]; });
  var PP_IRR = S('been gone done given taken seen known written spoken broken chosen driven eaten fallen flown forgotten grown hidden ridden risen sung sunk stolen swum thrown woken worn drawn drunk shown blown beaten bitten forgiven frozen shaken mistaken torn born borne sworn lain arisen begun gotten made built found told kept left lost sold sent spent held brought bought caught taught thought said heard paid laid met fed led stood understood stuck hung put cut hit set shut read hurt spread');
  var PAST_IRR = S('was were had did went came got made took gave saw knew thought said told found felt left brought bought caught taught fought began broke chose drove ate fell flew forgot grew hid rode rose ran sang sank spoke stole swam threw woke wore wrote drew drank sold sent spent built lent kept slept swept met led fed held stood understood sat lost won hung dug stuck struck swung shone shot laid paid heard meant bit forgave froze shook mistook lit slid spun tore bore swore lay arose became overcame withdrew');
  var COPULA = S('be become seem appear remain stay');
  var COPULA_ADJ = S('fall look feel sound taste smell get grow turn keep go come prove');
  var CLAUSE_V = S('know think say tell believe hope feel guess suppose realize realise wonder ask see understand decide show explain remember forget learn find discover imagine notice mean agree doubt expect hear read wish dream pretend promise prove report suggest insist admit deny claim care check worry ensure figure mind');
  var ING_V = S('enjoy stop keep finish mind avoid start begin like love hate remember try practice practise quit consider suggest imagine miss risk deny admit go come continue prefer');
  var OBJ_COMP = S('make keep find leave call consider get paint drive name elect think');
  var PHRASAL = S('pick:up put:on take:off turn:on turn:off give:up look:up find:out set:up put:out bring:up pick:out throw:away put:away take:out write:down put:down turn:down figure:out work:out give:back fill:in fill:out');
  var TO_AUX = S('used have has had ought going able supposed');

  /* ── 낱말 ── */
  var T, N;                       // 토큰 목록, 개수
  function W(i) { return i < N && T[i].w ? T[i].t.toLowerCase().replace(/’/g, "'") : ''; }
  function P(i) { return i < N && !T[i].w ? T[i].t : ''; }
  function multi(i, list) {
    for (var k = 0; k < list.length; k++) {
      var ws = list[k].split(' '), ok = true;
      for (var m = 0; m < ws.length; m++) if (W(i + m) !== ws[m]) { ok = false; break; }
      if (ok) return ws.length;
    }
    return 0;
  }
  function isPrep(i) { return multi(i, PREP2) || (PREP[W(i)] ? 1 : 0); }
  function isSub(i) { return multi(i, SUB2) || (SUB[W(i)] ? 1 : 0); }
  function isLy(w) { return w.length > 4 && /ly$/.test(w) && !NOT_LY[w]; }
  function isAdv(i) { var w = W(i); return !!w && (ADV[w] || isLy(w)); }
  function isPron(i) { return !!PRON[W(i)]; }
  function contr(i) {               // I'm · he's · they're · I'll · don't …
    var w = W(i), m = w.match(/^(.+)'(m|re|s|ve|ll|d)$/);
    if (m && (PRON[m[1]] || /^(that|there|here|what|who|it|let)$/.test(m[1]))) return m[2];
    return '';
  }
  function negAux(i) { return /n't$/.test(W(i)); }
  function lemma(w) {
    if (!w) return null;
    if (IRR[w]) return { b: IRR[w], f: PP_IRR[w] && !PAST_IRR[w] ? 'pp' : PAST_IRR[w] && PP_IRR[w] ? 'ed' : PAST_IRR[w] ? 'past' : /s$/.test(w) && !/ss$/.test(w) ? 's' : 'ed' };
    if (VB[w]) return { b: w, f: 'base' };
    var c, m;
    if ((m = w.match(/^(.+)ies$/)) && VB[c = m[1] + 'y']) return { b: c, f: 's' };
    if ((m = w.match(/^(.+)es$/)) && VB[m[1]]) return { b: m[1], f: 's' };
    if ((m = w.match(/^(.+)s$/)) && VB[m[1]] && !/ss$/.test(w)) return { b: m[1], f: 's' };
    if ((m = w.match(/^(.+)ied$/)) && VB[c = m[1] + 'y']) return { b: c, f: 'ed' };
    if ((m = w.match(/^(.+)ed$/))) {
      c = m[1];
      if (VB[c]) return { b: c, f: 'ed' };
      if (VB[c + 'e']) return { b: c + 'e', f: 'ed' };
      if (/(.)\1$/.test(c) && VB[c.slice(0, -1)]) return { b: c.slice(0, -1), f: 'ed' };
      if (w.length > 5 && !ADJ[w]) return { b: w, f: 'ed', guess: 1 };
    }
    if ((m = w.match(/^(.+)ing$/)) && !NOUN_ING[w]) {
      c = m[1];
      if (VB[c]) return { b: c, f: 'ing' };
      if (VB[c + 'e']) return { b: c + 'e', f: 'ing' };
      if (/(.)\1$/.test(c) && VB[c.slice(0, -1)]) return { b: c.slice(0, -1), f: 'ing' };
      if (/ie$/.test(c + 'ie') && VB[c.replace(/y$/, 'ie')]) return { b: c.replace(/y$/, 'ie'), f: 'ing' };
      if (w.length > 5) return { b: w, f: 'ing', guess: 1 };
    }
    return null;
  }
  function L(i) { return lemma(W(i)); }
  function isAdj(i) {
    var w = W(i); if (!w) return false;
    if (ADJ[w]) return true;
    if (NOT_ADJ_SUF[w]) return false;
    var m = w.match(/^(.+?)(er|est)$/);
    if (m && (ADJ[m[1]] || ADJ[m[1] + 'e'] || ADJ[m[1].replace(/i$/, 'y')] || (/(.)\1$/.test(m[1]) && ADJ[m[1].slice(0, -1)]))) return true;
    return w.length > 5 && /(ful|ous|ive|able|ible|less|ical|ish|ary)$/.test(w) && !lemma(w);
  }
  // 문 닫힌 낱말(명사 덩어리를 끊는 것)
  function closed(i) {
    var w = W(i);
    return !w || PREP[w] || COORD[w] || MODAL[w] || BE[w] || DO[w] || NEG[w] || (SUB_ONLY[w] && w !== 'once') ||
      (REL[w] && w !== 'that') || (WHQ[w] && !DET[w]) || negAux(i) || !!contr(i) || PRON[w] || (HAVE[w] && w !== 'having');
  }
  function lastW(pos) { for (var k = pos - 1; k >= 0; k--) if (T[k].w) return k; return pos; }
  function firstW(pos) { while (pos < N && !T[pos].w) pos++; return pos; }

  /* ── 기록 (시험 삼아 읽어 볼 때는 버리는 장부에) ── */
  function ctx() { return { roles: {}, parts: [], sv: 0 }; }
  function part(C, from, pos, kind, att) {
    var to = lastW(pos);
    if (to < from) return;
    C.parts.push({ from: from, to: to, kind: kind, att: att });
  }
  function role(C, i, r) { if (i < N && T[i].w) C.roles[i] = r; }

  /* ── 명사 덩어리 ── */
  function npStart(i) {
    var w = W(i); if (!w) return false;
    if (PRON[w] || DET[w] || /^\d/.test(w)) return true;
    if (closed(i) || (isAdv(i) && !isAdj(i + 1))) return false;
    var l = L(i);
    return !l || l.f === 'base' || T[i].t[0] !== T[i].t[0].toLowerCase() || isAdj(i);
  }
  function np(i, C, ctxName) {
    var j = i, w = W(i);
    if (!w) return null;
    var head = -1, det = false, content = 0;
    if (PRON[w] && !(w === 'her' && W(i + 1) && !closed(i + 1) && !isPrep(i + 1))) {
      head = j; j++;
      role(C, head, 'n');
      return post(head, j, C, ctxName, PRON_POST[w] ? 1 : 0);
    }
    if (contr(i)) { role(C, i, 'n'); return { pos: i, head: i, contr: true }; }
    for (;;) {
      w = W(j);
      if (!w) break;
      if ((DET[w] && !(w === 'that' && content)) || /^\d/.test(w) || (w === 'her' && !content)) {
        if (content) break;
        if (w === 'that' && det) break;
        det = true; j++; continue;
      }
      if (/'s?$/.test(w) && w.length > 2 && !contr(j)) { content++; j++; det = true; continue; }   // Tom's
      if (isAdv(j) && !content && isAdj(j + 1)) { j++; continue; }   // very big
      if (closed(j)) break;
      if (isAdv(j) && !ADJ[w] && (content || (!det && ctxName !== 'pobj'))) break;
      var l = L(j), cap = j > 0 && T[j].t[0] !== T[j].t[0].toLowerCase();
      if (content && l && !isAdj(j) && !cap) {
        if (ctxName === 'subj' || C.sv > 0) break;   // 주어 자리: 동사가 오면 명사 덩어리 끝
        if (l.f !== 'base') break;
      }
      // 동사 꼴로 시작하면 명사 덩어리가 아니다 (복수 명사 -s 는 목적어 자리 · 뒤에 동사가 올 때 허용)
      if (!content && !det && l && l.f !== 'base' && !isAdj(j) && !cap && !(l.f === 's' && (ctxName !== 'subj' || vgStart(j + 1)))) break;
      content++; head = j; j++;
    }
    if (!content) {
      if (det && j > i) { head = j - 1; }              // all · those · many 처럼 혼자 쓰인 한정사
      else return null;
    }
    role(C, head, 'n');
    return post(head, j, C, ctxName, det && !content ? 1 : 0);
  }
  // 명사 뒤에 붙는 것: 전치사구(빨간 괄호) · 절(빨간 사선)
  function post(head, j, C, ctxName, pronPost) {
    var hadPost = false, hadRel = false, guard = 0;
    var isP = PRON[W(head)] && !pronPost;
    while (j < N && guard++ < 40) {
      var w = W(j), k = j;
      // , who … / , but who … — 같은 명사에 절이 하나 더
      if (P(k) === ',' || COORD[W(k)]) {
        var k2 = k; if (P(k2) === ',') k2++; if (COORD[W(k2)]) k2++;
        if (k2 > k && hadRel && (relWord(k2, head) ||(isPrep(k2) && /^(which|whom|whose)$/.test(W(k2 + isPrep(k2)))))) { j = k2; w = W(j); }
        else if (P(k) === ',' && relWord(k + 1, head) && /^(who|whom|which|whose)$/.test(W(k + 1))) { j = k + 1; w = W(j); }
        else {
          // 주어 자리에서 A, B and C 처럼 나란히
          if (ctxName === 'subj' && !C.hasV) {
            var k3 = k; if (P(k3) === ',') k3++; if (COORD[W(k3)] && W(k3) !== 'yet') k3++;
            if (k3 > k && npStart(k3) && !isSub(k3) && !isPrep(k3)) {
              if (!COORD[W(k + 1)]) {      // 쉼표만 있으면: 뒤에 쉼표 · and 가 더 이어질 때만 나열 (A, B and C)
                var Cd = ctx(); Cd.sv = 1; Cd.hasV = true;
                var xd = np(k3, Cd, 'subj');
                if (!xd || !(P(xd.pos) === ',' || COORD[W(xd.pos)])) break;
              }
              var nx = np(k3, C, 'subj'); if (nx && nx.pos > k3) { j = nx.pos; hadPost = true; continue; }
            }
          }
          break;
        }
      }
      if (isPrep(j) && /^(which|whom|whose)$/.test(W(j + isPrep(j)))) { j = rel(j, C, head); hadPost = hadRel = true; continue; }
      if (relWord(j, head) && !isP) { j = rel(j, C, head); hadPost = hadRel = true; continue; }
      if (isP) break;
      var pl = isPrep(j);
      if (pl) {
        if (w === 'to' && lemma(W(j + 1)) && lemma(W(j + 1)).f === 'base' && !DET[W(j + 1)]) {   // a place to live
          if (ctxName === 'pobj') break;
          var s0 = j; j = clause(j + 1, C, { noSubj: true, toInf: true }); part(C, s0, j, 'cl', 'n'); hadPost = true; continue;
        }
        if (w === 'of' || ctxName === 'subj' || (w === 'about' && ctxName === 'obj') || (ctxName === 'subjp' && w !== 'than')) {
          if (isSub(j) && clauseAfter(j + isSub(j))) break;
          if (w === 'as' || w === 'than') break;
          var s1 = j; j = pp(j, C, 'n'); if (j === s1) break; hadPost = true; continue;
        }
        break;
      }
      var l = lemma(w);
      if (l && l.f === 'ing' && !ADJ_ING[w] && !NOUN_ING[w] && ctxName !== 'subj') {     // creature / soaring …
        var s2 = j; j = clause(j, C, { noSubj: true, part: true }); if (j > s2) { part(C, s2, j, 'cl', 'n'); hadPost = true; continue; }
      }
      if (l && (l.f === 'pp' || l.f === 'ed') && (W(j + 1) === 'by' || (ctxName !== 'subj' && isPrep(j + 1)))) {   // the book / written by …
        var s3 = j; j = clause(j, C, { noSubj: true, part: true }); if (j > s3) { part(C, s3, j, 'cl', 'n'); hadPost = true; continue; }
      }
      break;
    }
    return { pos: j, head: head, post: hadPost };
  }
  function relWord(j, head) {
    var w = W(j);
    if (/^(who|whom|whose|which)$/.test(w)) return true;
    if (w === 'that') return thatClause(j + 1);
    if (/^(where|when|why)$/.test(w)) return !!REL_ADV_NOUN[W(head)];
    return false;
  }
  function thatClause(k) { return vgStart(k) || clauseAfter(k); }
  // 관계사절 — 관계사가 주어면 주어 없이 동사부터
  function rel(j, C, head) {
    var s = j, k = j;
    k += isPrep(k);                       // in which · of which
    var w = W(k); k++;
    if (w === 'whose') {                  // whose dog barked
      var n2 = np(k, C, 'subjp'); if (n2) k = n2.pos;
      k = vgStart(k) ? clause(k, C, { noSubj: true }) : clause(k, C, {});
    } else if (/^(who|which|that)$/.test(w) && s === j && vgStart(k)) k = clause(k, C, { noSubj: true });
    else k = clause(k, C, {});
    part(C, s, k, 'cl', 'n');
    return k;
  }

  /* ── 전치사구 ── */
  function pp(j, C, att) {
    var s = j, n = isPrep(j); j += n;
    while (isAdv(j) && npStart(j + 1)) j++;
    var w = W(j), l = lemma(w);
    if (WHQ[w] && !DET[w] || w === 'whatever') {              // about what he said
      var s2 = j; j = nounClause(j, C); part(C, s2, j, 'cl', 'v');
    } else if (l && l.f === 'ing' && !NOUN_ING[w] && !ADJ_ING[w]) {        // by reading books
      j = clause(j, C, { noSubj: true, part: true });
    } else {
      var x = np(j, C, 'pobj');
      if (!x) return s;
      if (!x.post) delete C.roles[x.head];             // 전치사구 안 명사는 설명이 달릴 때만 표시
      j = x.pos;
    }
    if (j === s + n) return s;
    part(C, s, j, 'pp', att);
    return j;
  }

  /* ── 동사 덩어리 ── */
  function vgStart(k) {
    while (isAdv(k) && !BE[W(k)]) k++;
    var w = W(k);
    if (!w) return false;
    if (MODAL[w] || BE[w] || DO[w] || negAux(k) || (HAVE[w] && w !== 'having')) return true;
    var l = lemma(w);
    return !!(l && l.f !== 'ing' && !(l.f === 'base' && (DET[w] || PRON[w])) && !(l.f === 'pp' && !PAST_IRR[w]));
  }
  function vg(j, C, o) {
    o = o || {};
    var k = j, ws = [], last = o.last || '', main = -1, mainL = null, lastAuxEnd = j;
    if (o.toInf && W(k) === 'to') { k++; last = 'to'; lastAuxEnd = k; }
    for (var g = 0; g < 12; g++) {
      var w = W(k);
      if (!w) break;
      if ((NEG[w] || isAdv(k)) && ws.length && !BE[w]) { k++; continue; }
      if (w === 'to' && TO_AUX[last] && lemma(W(k + 1)) && lemma(W(k + 1)).f === 'base') { ws.push(k); k++; last = 'to'; lastAuxEnd = k; continue; }
      if (w === 'going' && BE[last] && W(k + 1) === 'to') { ws.push(k); k++; last = 'going'; lastAuxEnd = k; continue; }
      if (w === 'used' && W(k + 1) === 'to' && !BE[last]) { ws.push(k); k++; last = 'used'; lastAuxEnd = k; continue; }
      if (w === 'able' && BE[last] && W(k + 1) === 'to') { ws.push(k); k++; last = 'able'; lastAuxEnd = k; continue; }
      if (w === 'supposed' && BE[last] && W(k + 1) === 'to') { ws.push(k); k++; last = 'supposed'; lastAuxEnd = k; continue; }
      if ((HAVE[w] || W(k) === 'had') && W(k + 1) === 'to' && lemma(W(k + 2)) && lemma(W(k + 2)).f === 'base') { ws.push(k); k++; last = 'have'; lastAuxEnd = k; continue; }
      if (MODAL[w] || negAux(k) || ((BE[w] || HAVE[w] || DO[w]) && !(main >= 0))) {
        if (last === 'to' && !(w === 'be' || w === 'have' || w === 'do')) break;
        // 한 덩어리에 때 있는 조동사(is · was · has · does · can …)는 맨 앞 하나뿐
        if (ws.length && (MODAL[w] || negAux(k) || /^(am|is|are|was|were|has|does|did)$/.test(w) || (/^(have|had|do)$/.test(w) && last !== 'modal' && last !== 'to'))) break;
        ws.push(k); last = BE[w] ? 'be' : HAVE[w] ? 'have' : DO[w] ? 'do' : negAux(k) ? (/^(is|are|was|were|ai)/.test(w) ? 'be' : /^(has|have|had)/.test(w) ? 'have' : /^(do|does|did)/.test(w) ? 'do' : 'modal') : 'modal';
        k++; lastAuxEnd = k;
        if (w === 'being' || w === 'been') last = 'be';
        continue;
      }
      var l = lemma(w);
      if (!l || DET[w] || PRON[w]) break;
      if (last === 'be') {
        if (l.f === 'ing') { if (ADJ_ING[w]) break; }
        else if (l.f === 'base' || l.f === 's' || l.f === 'past') break;
        else if ((ADJ[w] || /^(lost|gone|finished|dressed)$/.test(w)) && W(k + 1) !== 'by') break;   // 형용사 같은 분사 → 보어
      } else if (last === 'have') {
        if (!(l.f === 'pp' || l.f === 'ed')) break;
      } else if (last === 'do' || last === 'modal' || last === 'to') {
        if (l.f !== 'base' && !(l.b === 'be' && w === 'be') && !(l.b === 'have' && w === 'have')) break;
      } else if (o.part) {
        // 분사로 시작 (soaring · written)
      } else if (l.f === 'ing' && !o.allowIng) break;
      else if (l.f === 'pp' && !PAST_IRR[w]) break;
      ws.push(k); main = k; mainL = l; k++;
      // 구동사 짝 (picked up)
      if (PHRASAL[mainL.b + ':' + W(k)] && npStart(k + 1)) { ws.push(k); k++; }
      break;
    }
    if (!ws.length) return o.last ? { pos: k, lemma: o.last === 'be' ? 'be' : o.last === 'have' ? 'have' : '', cop: o.last === 'be' } : null;
    if (main < 0) {
      main = ws[ws.length - 1]; mainL = lemma(W(main)) || { b: W(main), f: 'base' };
      if (negAux(main)) mainL = { b: last === 'be' ? 'be' : last === 'have' ? 'have' : 'do', f: 'base' };
      k = lastAuxEnd;
      if (last === 'to') return null;
    }
    ws.forEach(function (i) { role(C, i, 'v'); });
    var b = mainL.b, mw = W(main);
    if (/'(m|re|s)$/.test(mw) || /^(ai)?n't$/.test(mw)) b = 'be';
    return { pos: k, lemma: b, cop: !!COPULA[b] || (b === 'be'), copAdj: !!COPULA_ADJ[b] };
  }

  /* ── 절 하나 ── */
  function clauseAfter(k) {             // k 부터 '주어 + 동사' 가 오는가
    if (!npStart(k) && !contr(k)) return false;
    if (contr(k)) return true;
    var C = ctx(); C.sv = 1;
    var x = np(k, C, 'subj');
    return !!x && x.pos > k && vgStart(x.pos);
  }
  function nounClause(j, C) {            // what he said · whether … · how to …
    var w = W(j), k = j + 1;
    if (w === 'whether' || w === 'if') return clause(k, C, {});
    if (W(k) === 'to' && lemma(W(k + 1))) return clause(k, C, { noSubj: true, toInf: true });
    if (/^(what|which|whose|how)$/.test(w) && !vgStart(k)) {
      if (w === 'how' && (isAdj(k) || isAdv(k))) k++;
      else if (w !== 'how' && npStart(k) && !clauseAfter(k)) { var C2 = ctx(); var x = np(k, C2, 'obj'); if (x && vgStart(x.pos) === false && clauseAfter(x.pos)) k = x.pos; }
    }
    if (/^(who|what|which)$/.test(w) && vgStart(k)) return clause(k, C, { noSubj: true });
    return clause(k, C, {});
  }
  function clause(i, C, o) {
    o = o || {};
    var k = i, guard = 0;
    var save = C.hasV; C.hasV = false;
    // 문장 앞 부품: 초록 괄호 · 초록 박스
    if (!o.noSubj) {
      while (k < N && guard++ < 8) {
        if (P(k) && /^[“"‘'(—–-]$/.test(P(k))) { k++; continue; }
        var sb = isSub(k);
        if (sb && (SUB_ONLY[W(k)] || sb > 1 || clauseAfter(k + sb))) {
          var s = k, e = clause(k + sb, C, { sub: true });
          if (e === k + sb) break;
          part(C, s, e, 'cl', 's'); k = e; if (P(k) === ',') k++; continue;
        }
        if (isPrep(k) && !(W(k) === 'to' && lemma(W(k + 1)))) {
          var s2 = k, e2 = pp(k, C, 's'); if (e2 === k) break;
          k = e2; if (P(k) === ',') k++; continue;
        }
        if (isAdv(k) && !isAdj(k + 1) && !(W(k) === 'there' && BE[W(k + 1)])) { k++; if (P(k) === ',') k++; continue; }
        var l0 = L(k);
        if ((l0 && (l0.f === 'ing' || l0.f === 'pp' || (l0.f === 'ed' && !vgStart(k + 1))) && !NOUN_ING[W(k)]) || (W(k) === 'to' && lemma(W(k + 1)))) {
          // Walking home, … / To be honest, … (쉼표까지) — 아니면 주어 자리 절
          var C2 = ctx(), e3 = clause(k, C2, { noSubj: true, part: true, toInf: W(k) === 'to' });
          if (P(e3) === ',' && e3 > k) {
            var s3 = k; k = clause(k, C, { noSubj: true, part: true, toInf: W(k) === 'to' }); part(C, s3, k, 'cl', 's'); k++; continue;
          }
          if (e3 > k && vgStart(e3)) {         // Swimming in the sea is fun → 빨간 박스(동사 앞)
            var s4 = k; k = clause(k, C, { noSubj: true, part: true, toInf: W(k) === 'to' }); part(C, s4, k, 'cl', 'v');
            var vv = vg(k, C, {}); if (!vv) { C.hasV = save; return k; }
            return after(vv.pos, C, vv, o, save);
          }
        }
        break;
      }
    }
    var v = null;
    if (!o.noSubj) {
      var w = W(k);
      if ((w === 'there' || w === 'here') && (BE[W(k + 1)] || MODAL[W(k + 1)] || contr(k))) { k += contr(k) ? 0 : 1; if (contr(k)) { v = { pos: k + 1, lemma: 'be', cop: true }; role(C, k, 'v'); } }
      else if (!o.sub && (MODAL[w] || BE[w] || DO[w] || HAVE[w] || negAux(k)) && npStart(k + 1) && (o.q)) {
        // 묻는 문장: Do you like …? / Is he …?
        var aux = k; role(C, aux, 'v'); k++;
        C.sv++; var xq = np(k, C, 'subj'); C.sv--; if (xq) k = xq.pos;
        v = vg(k, C, {}) || { pos: k, lemma: W(aux), cop: !!BE[W(aux)] };
      } else if (/^(what|who|whom|which|whose|where|when|why|how)$/.test(w) && o.q && !o.sub) {
        k++;
        if (w === 'how' && (isAdj(k) || isAdv(k))) k++;
        if (vgStart(k) && !(MODAL[W(k)] || BE[W(k)] || DO[W(k)] || HAVE[W(k)])) { v = vg(k, C, {}); }
        else if (MODAL[W(k)] || BE[W(k)] || DO[W(k)] || HAVE[W(k)] || negAux(k)) {
          var a2 = k; role(C, a2, 'v'); k++;
          if (npStart(k)) { C.sv++; var xq2 = np(k, C, 'subj'); C.sv--; if (xq2) k = xq2.pos; }
          v = vg(k, C, {}) || { pos: k, lemma: W(a2), cop: !!BE[W(a2)] };
        } else if (npStart(k)) { var xx = np(k, C, 'obj'); if (xx) k = xx.pos; v = vg(k, C, {}); }
      } else if (/^(what|whatever|whoever|whether)$/.test(w) || (w === 'that' && !o.sub && clauseAfter(k + 1))) {
        // What he said is true → 동사 앞 절(빨간 박스)
        var C3 = ctx(), e4 = nounClause(k, C3);
        if (vgStart(e4)) { var s5 = k; k = nounClause(k, C); part(C, s5, k, 'cl', 'v'); }
      }
      if (!v) {
        var l1 = L(k);
        // 시키는 문장: Look at the sky. (맨 앞이 동사 원형)
        var imper = o.top && !o.sub && k === firstW(i) && l1 && l1.f === 'base' && !DET[w] && !PRON[w] &&
          (!W(k + 1) || DET[W(k + 1)] || PRON[W(k + 1)] || isPrep(k + 1) || isAdv(k + 1));
        if (!imper && (npStart(k) || contr(k))) {
          C.sv++;
          var x = np(k, C, 'subj');
          C.sv--;
          if (x) {
            if (x.contr) { var cw = contr(k); k++; v = vg(k, C, { last: /^(m|re|s)$/.test(cw) ? 'be' : cw === 've' ? 'have' : 'modal' }); }
            else k = x.pos;
          }
        }
      }
    }
    if (!v) v = vg(k, C, o);
    if (!v) { C.hasV = save; return k; }
    return after(v.pos, C, v, o, save);
  }
  // 동사 뒤: 목적어 · 보어 · 파란 괄호 · 빨간 박스 · 문장 뒤 초록 박스
  function after(k, C, v, o, save) {
    C.hasV = true;
    var objs = 0, guard = 0, gotAdj = false;
    while (k < N && guard++ < 30) {
      var w = W(k);
      if (!w) {
        if (P(k) === ',') {
          var k1 = k + 1;
          if (isSub(k1) && (SUB_ONLY[W(k1)] || isSub(k1) > 1 || clauseAfter(k1 + isSub(k1)))) { k = k1; continue; }
          var l1 = L(k1);
          if (l1 && l1.f === 'ing' && !NOUN_ING[W(k1)] && !o.sub) { var s0 = k1; k = clause(k1, C, { noSubj: true, part: true }); part(C, s0, k, 'cl', 'v'); continue; }
        }
        if (P(k) === '"' || P(k) === '”') { k++; continue; }
        break;
      }
      // 보어 형용사 (노란 형광) + 형용사 뒤 부품
      if ((v.cop || v.copAdj || (OBJ_COMP[v.lemma] && objs)) && !gotAdj && (isAdj(k) || (isAdv(k) && isAdj(k + 1)))) {
        var a = k; while (isAdv(a) && isAdj(a + 1)) a++;
        var nx0 = a + 1;
        if (!W(nx0) || closed(nx0) || isPrep(nx0) || /^(that|to|enough)$/.test(W(nx0)) || isAdv(nx0) || COORD[W(nx0)]) {   // good friends 는 명사 덩어리
          role(C, a, 'j'); k = adjPost(a + 1, C); gotAdj = true; continue;
        }
      }
      if ((NEG[w] || isAdv(k)) && !isPrep(k) && !(w === 'so' && clauseAfter(k + 1))) { k++; continue; }
      // 동사 앞 · 뒤 절 (빨간 박스): that … / what … / whether …
      var one = /^(ask|tell|show|teach|explain|promise|remind|warn|inform|assure|convince)$/.test(v.lemma) ? 1 : 0;
      if ((CLAUSE_V[v.lemma] || v.cop || one) && objs <= one) {
        if (w === 'that' && thatClause(k + 1)) { var s1 = k; k = clause(k + 1, C, { sub: true }); part(C, s1, k, 'cl', 'v'); objs++; continue; }
        if (WHQ[w] && (CLAUSE_V[v.lemma] || /^(what|whatever|how|whether|who)$/.test(w)) && !(SUB_ONLY[w] && !CLAUSE_V[v.lemma])) {
          var s2 = k; k = nounClause(k, C); part(C, s2, k, 'cl', 'v'); objs++; continue;
        }
      }
      if (objs === 0 && (/^(what|whatever|whoever)$/.test(w) || (w === 'how' && !isAdj(k + 1)))) { var s3 = k; k = nounClause(k, C); part(C, s3, k, 'cl', 'v'); objs++; continue; }
      // 문장 뒤 절 (초록 박스): because … / when … / until …
      var sb = isSub(k);
      if (sb && (SUB_ONLY[W(k)] || sb > 1 || clauseAfter(k + sb))) {
        var s4 = k, e4 = clause(k + sb, C, { sub: true });
        if (e4 > k + sb) { part(C, s4, e4, 'cl', 's'); k = e4; continue; }
      }
      // made me clean … · let him go … (목적어 뒤 동사 원형 → 빨간 박스)
      if (objs && /^(make|let|have|help|watch|see|hear|feel)$/.test(v.lemma) && lemma(w) && lemma(w).f === 'base' && !DET[w] && !PRON[w] && (!isAdj(k) || DET[W(k + 1)] || PRON[W(k + 1)])) {
        var sc = k; k = clause(k, C, { noSubj: true, part: true }); part(C, sc, k, 'cl', 'v'); continue;
      }
      // to 부정사 · -ing (빨간 박스)
      if (w === 'to' && lemma(W(k + 1)) && lemma(W(k + 1)).f === 'base' && !DET[W(k + 1)] && !PRON[W(k + 1)]) {
        var s5 = k; k = clause(k, C, { noSubj: true, toInf: true }); part(C, s5, k, 'cl', 'v'); objs++; continue;
      }
      var lk = lemma(w);
      if (lk && lk.f === 'ing' && !NOUN_ING[w] && !ADJ_ING[w] && (ING_V[v.lemma] || objs)) {
        var s6 = k; k = clause(k, C, { noSubj: true, part: true }); part(C, s6, k, 'cl', 'v'); objs++; continue;
      }
      // 동사 뒤 전치사구 (파란 괄호)
      if (isPrep(k)) {
        if (isSub(k) && clauseAfter(k + isSub(k))) { var s7 = k, e7 = clause(k + isSub(k), C, { sub: true }); part(C, s7, e7, 'cl', 's'); k = e7; continue; }
        var e8 = pp(k, C, 'v'); if (e8 === k) { k++; continue; } k = e8; continue;
      }
      if (COORD[w]) {
        var nx = k + 1;
        if (P(nx) === ',') nx++;
        if (clauseAfter(nx) || isSub(nx)) break;              // 새 절 → 바깥에서
        if (vgStart(nx)) { var v2 = vg(nx, C, {}); if (v2) { v = v2; k = v2.pos; objs = 0; gotAdj = false; continue; } }
        if (isAdj(nx) && gotAdj) { role(C, nx, 'j'); k = adjPost(nx + 1, C); continue; }
        if (npStart(nx)) { var xc = np(nx, C, 'obj'); if (xc) { k = xc.pos; continue; } }
        break;
      }
      // that 이 빠진 절: I think he is right.
      if (CLAUSE_V[v.lemma] && !objs && clauseAfter(k) && (PRON[w] && !/^(me|him|us|them|her)$/.test(w) || DET[w] || /^[A-Z]/.test(T[k].t))) { var s10 = k; k = clause(k, C, { sub: true }); part(C, s10, k, 'cl', 'v'); objs++; continue; }
      if (PRON_SUBJ[w] || contr(k)) break;     // 새 '주어 + 동사' → 다음 절
      if (objs < 2 && (npStart(k) || (lk && lk.f === 's'))) {
        var x = np(k, C, 'obj');
        if (x && x.pos > k) { k = x.pos; objs++; continue; }
      }
      break;
    }
    C.hasV = save;
    return k;
  }
  function adjPost(k, C) {
    for (var g = 0; g < 6; g++) {
      var w = W(k);
      if (w === 'to' && lemma(W(k + 1)) && lemma(W(k + 1)).f === 'base' && !DET[W(k + 1)]) { var s = k; k = clause(k, C, { noSubj: true, toInf: true }); part(C, s, k, 'cl', 'j'); continue; }
      if (w === 'that' && thatClause(k + 1)) { var s2 = k; k = clause(k + 1, C, { sub: true }); part(C, s2, k, 'cl', 'j'); continue; }
      if (/^(whether|if|what|how|who|where|why)$/.test(w) && w !== 'if' && clauseAfter(k + 1)) { var s3 = k; k = nounClause(k, C); part(C, s3, k, 'cl', 'j'); continue; }
      if (isPrep(k) && !(isSub(k) && clauseAfter(k + isSub(k))) && w !== 'than') {
        if (/^(of|to|for|with|about|at|from|in|on|by)$/.test(w) || isPrep(k) > 1) { var e = pp(k, C, 'j'); if (e > k) { k = e; continue; } }
      }
      break;
    }
    return k;
  }

  /* ── 문장 전체 ── */
  function sentence(i, C, q) {
    var k = i, guard = 0;
    while (k < N && guard++ < 20) {
      while (k < N && !T[k].w) k++;
      if (k >= N) break;
      if (COORD[W(k)] || W(k) === 'so' || W(k) === 'then') { k++; continue; }
      var e = clause(k, C, { q: q, top: true });
      if (e <= k) e = k + 1;           // 읽지 못한 낱말은 건너뛴다
      k = e;
    }
  }
  SB.analyze = function (text) {
    var src = String(text || '').replace(/[{}<>*\[\]]/g, '').replace(/\s+/g, ' ').trim();
    if (!src) return '';
    var A = SB.markParse(src);
    T = A.toks; N = T.length;
    var C = ctx();
    try { sentence(0, C, /\?\s*["”’']?\s*$/.test(src)); } catch (e) { if (window.console) console.warn('구조 생성기', e); }
    // 엇갈린 덩어리는 버린다(안전장치)
    var ok = [];
    C.parts.sort(function (a, b) { return a.from - b.from || b.to - a.to; }).forEach(function (p) {
      var bad = ok.some(function (q) { return !(p.to < q.from || p.from > q.to || (p.from >= q.from && p.to <= q.to) || (q.from >= p.from && q.to <= p.to)) || (q.from === p.from && q.to === p.to); });
      if (!bad) ok.push(p);
    });
    return SB.markSerialize(T, C.roles, ok);
  };

  /* ── 여러 문장 나누기 ── */
  SB.splitSentences = function (text) {
    var t = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
    var out = [];
    t.split(/\n+/).forEach(function (para) {
      var s = para.trim(); if (!s) return;
      var re = /([.!?]+["”’')]*)\s+(?=["“‘'(]?[A-Z0-9])/g, last = 0, m;
      while ((m = re.exec(s))) {
        var cut = m.index + m[1].length, before = s.slice(last, cut);
        if (/\b(Mr|Mrs|Ms|Dr|St|Prof|Jr|Sr|vs|etc|e\.g|i\.e|No)\.$/i.test(before.trim())) continue;
        out.push(before.trim()); last = cut;
      }
      if (s.slice(last).trim()) out.push(s.slice(last).trim());
    });
    return out.filter(function (x) { return /[A-Za-z]/.test(x); });
  };
})();
