/* 문장 훈련 자료 (홈 맛보기 · 문장 훈련 화면). 강의는 xms 강의 관리에서 온다. */
window.SB = window.SB || {};

/* 문장 훈련 — 입력 기호
   들여쓰기(공백 2칸) = 계단 한 단계      빈 줄 = 위와 간격
   {동사}  <핵심 명사>  [연결어]  +등위접속사  (수식어구)  *보어*  ~조동사 등~  /관계사 시작
   줄 앞 #2 = 정보 단계 직접 지정    줄 앞 @단어 = 위 줄의 그 단어 아래에 매달기(없으면 마지막 단어) */
SB.sets = [
  {
    id: 't1', title: 'TEXT 1',
    src: 'When I was a boy, I knew an old gentleman who used to say the most ferocious things about his landlady behind her back, but who was all smiles and obeisance as soon as she came into the room.',
    en: [
      '#2 [When] I {was} a boy,',
      'I {knew} an old <gentleman>',
      '  /who ~used to~ {say} the most ferocious <things>',
      '    (about his landlady)',
      '    @say (behind her back),',
      '  +but',
      '  /who {was} all smiles +and obeisance',
      '    [as soon as] she {came}',
      '      (into the room).'
    ].join('\n'),
    ko: [
      '#2 [~할 때] 내가 {이었다} 소년',
      '나는 {알았다} 한 나이 든 <신사>를',
      '  /{말하곤 했던} 가장 사나운 <것들>을',
      '    (그의 여자 집주인에 대해)',
      '    @말하곤 (그녀의 등 뒤에서)',
      '  +그러나',
      '  /{였던} 모든 미소 +그리고 공손함',
      '    [~하자마자] 그녀가 {왔다}',
      '      (방 안으로)'
    ].join('\n')
  },
  {
    id: 't2', title: 'TEXT 2',
    src: 'You are mistaken if you think that luxury, neglect of good manners, and other vices of which each man accuses the age in which he lives are especially characteristic of our own epoch; no era in history has ever been free from blame.',
    en: [
      'You {are} mistaken',
      '  [if] you {think} [that] <luxury>, <neglect> +and other <vices> {are} especially *characteristic*',
      '    @neglect (of good manners),',
      '    (of our own epoch);',
      '    @vices /of which each man {accuses} the <age>',
      '      (in which he lives)',
      '',
      'no <era> {has} ever {been} *free*',
      '  @era (in history)',
      '  (from blame).'
    ].join('\n'),
    ko: [
      '너는 {틀렸다}',
      '  [만약 ~라면] 네가 {생각한다} [~라고] <사치>, <무시> +그리고 다른 <악덕들>이 {이다} 특히 *특징적*',
      '    @무시 (좋은 예절의),',
      '    (우리 자신의 시대의);',
      '    @악덕들 /그것으로 각자가 {비난한다} 그 <시대>를',
      '      (그가 사는)',
      '',
      '어떤 <시대>도 {~않았다} 결코 *자유롭지*',
      '  @시대 (역사 속)',
      '  (비난으로부터).'
    ].join('\n')
  }
];

/* 문장 표시 훈련 정답 — 강사 규칙(문장구조)
   뼈대(1차 정보): {동사}  <명사>  *형용사*
   부품: 전치사구 = 붙는자리( … )   절 = 붙는자리[ … ]
   붙는 자리: n 명사 뒤 · j 형용사 뒤 · v 동사 · s 문장   (안에 또 넣으면 3차 정보) */
SB.marks = [
  { id: 'm1', level: '입문', title: '연습 1',
    a: 'The <boy> n(in the red cap) {ran} v(to the station).' },
  { id: 'm2', level: '입문', title: '연습 2',
    a: '<I> {know} v[that <he> {is} *honest*].' },
  { id: 'm3', level: '기초', title: '연습 3',
    a: '<She> {is} *proud* j(of her <son> n[who {won} the <race>]).' },
  { id: 'm4', level: '기초', title: '연습 4',
    a: 's(After lunch), the <children> {played} v(in the park) s[until the <sun> {went} down].' },
  { id: 't1', level: '중급', title: 'TEXT 1',
    a: 's[When <I> {was} a <boy>], <I> {knew} an old <gentleman> n[who {used to say} the most ferocious <things> n(about his landlady) v(behind her back)], but n[who {was} all <smiles> and <obeisance> s[as soon as <she> {came} v(into the room)]].' },
  { id: 't2', level: '중급', title: 'TEXT 2',
    a: '<You> {are} *mistaken* s[if <you> {think} v[that <luxury>, <neglect> n(of good manners), and other <vices> n[of which each <man> {accuses} the <age> n[in which <he> {lives}]] {are} especially *characteristic* j(of our own epoch)]]; no <era> n(in history) {has} ever {been} *free* j(from blame).' }
];
