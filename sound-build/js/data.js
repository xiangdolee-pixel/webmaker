/* 시안용 예시 자료 — 2단계에서 xms "강의" · "문장 훈련" 관리 화면이 이 자리를 채운다.
   v: YouTube · Vimeo 주소 (비어 있으면 '영상 연결 전' 화면) */
window.SB = window.SB || {};

SB.tracks = { sound: 'Sound', build: 'Build', real: 'Sound & Build' };

SB.courses = [
  {
    id: 'sound-1', track: 'sound', level: '입문', no: 'Sound 1', date: '2026-11-01',
    title: '영어 소리의 기초 — 들리는 대로 말하기',
    desc: '철자가 아니라 소리로 영어를 만납니다. 강세 · 약모음 · 끊어 말하기로 귀와 입을 먼저 엽니다.',
    who: ['단어는 아는데 말로 들으면 모르는 분', '발음이 딱딱하다는 말을 듣는 분', '영어를 처음부터 다시 시작하는 분', '듣기 점수가 늘 제자리인 분'],
    learn: ['강세와 약모음이 만드는 영어의 리듬', '한국어에 없는 소리 12가지', '덩어리(청크)로 끊어 말하기', '쉐도잉 루틴 만들기'],
    sections: [
      { title: '소리의 단위', lessons: [
        { t: 'OT · 영어는 왜 안 들릴까', d: '08:12', free: true },
        { t: '강세 하나가 단어를 바꾼다', d: '14:40' },
        { t: '약해지는 모음, 슈와(ə)', d: '16:05' }
      ] },
      { title: '한국어에 없는 소리', lessons: [
        { t: 'f · v · th 를 입 모양으로', d: '15:22' },
        { t: 'r 과 l, 혀의 자리', d: '13:48' },
        { t: '끝소리를 삼키는 법', d: '12:30' }
      ] },
      { title: '덩어리로 말하기', lessons: [
        { t: '숨 단위로 끊어 읽기', d: '17:10' },
        { t: '쉐도잉 1주 루틴', d: '11:55' }
      ] }
    ]
  },
  {
    id: 'sound-2', track: 'sound', level: '기초', no: 'Sound 2', date: '2026-11-03',
    title: '연음과 리듬 — 원어민 속도 따라잡기',
    desc: '단어와 단어가 붙고, 빠지고, 바뀌는 규칙을 익혀 빠른 영어도 덩어리로 들리게 합니다.',
    who: ['느린 영어는 들리는데 빠르면 놓치는 분', '미드 · 유튜브를 자막 없이 보고 싶은 분'],
    learn: ['연음 · 탈락 · 동화 규칙', '기능어가 약해지는 원리', '문장 강세와 억양 곡선', '실제 대화 받아쓰기'],
    sections: [
      { title: '붙는 소리', lessons: [
        { t: '자음 + 모음 연음', d: '13:20', free: true },
        { t: 'want to → wanna 의 정체', d: '12:42' }
      ] },
      { title: '사라지는 소리', lessons: [
        { t: 't 탈락과 플랩', d: '15:00' },
        { t: '기능어는 왜 약하게 들릴까', d: '14:18' }
      ] },
      { title: '문장의 리듬', lessons: [
        { t: '내용어는 길게, 기능어는 짧게', d: '16:33' },
        { t: '실전 받아쓰기 3회', d: '21:04' }
      ] }
    ]
  },
  {
    id: 'build-1', track: 'build', level: '입문', no: 'Build 1', date: '2026-11-02',
    title: '문장의 뼈대 — 1차 정보 찾기',
    desc: '아무리 긴 문장도 뼈대는 하나입니다. 주어와 동사, 1차 정보만 먼저 세우는 눈을 기릅니다.',
    who: ['긴 문장만 보면 처음부터 다시 읽는 분', '문법 용어는 아는데 독해에 안 쓰이는 분', '수능 · 공무원 · 토익 독해가 느린 분'],
    learn: ['동사를 먼저 찾는 습관', '1차 정보 = 주어 + 동사 + 필수 성분', '수식어를 괄호로 묶어 덜어 내기', '한 문장을 한 줄로 요약하기'],
    sections: [
      { title: '뼈대 세우기', lessons: [
        { t: 'OT · 정보에는 계층이 있다', d: '10:05', free: true },
        { t: '동사부터 찾아라', d: '15:30' },
        { t: '주어는 동사가 알려 준다', d: '13:12' }
      ] },
      { title: '덜어 내기', lessons: [
        { t: '전치사구는 괄호로', d: '14:44' },
        { t: '1차 정보만 남기기 연습', d: '18:20' }
      ] }
    ]
  },
  {
    id: 'build-2', track: 'build', level: '기초', no: 'Build 2', date: '2026-11-05',
    title: '정보의 계층화 — 2차 · 3차 정보 조립',
    desc: '관계사절 · 종속절 · 수식어가 어느 단어에 매달리는지 계단으로 그리며, 정보를 층층이 조립합니다.',
    who: ['관계대명사가 나오면 길을 잃는 분', '해석은 되는데 문장이 머리에 안 남는 분'],
    learn: ['종속절(When · If · As soon as)의 자리', '관계사절이 매달리는 단어 찾기', '등위접속사로 나뉘는 정보', '2차 · 3차 정보를 계단으로 그리기'],
    sections: [
      { title: '2차 정보', lessons: [
        { t: '[종속절] 은 상자에 담는다', d: '16:10', free: true },
        { t: '/관계사 는 앞 단어에 매달린다', d: '17:45' },
        { t: 'but · and 가 정보를 나눈다', d: '12:58' }
      ] },
      { title: '3차 정보', lessons: [
        { t: '수식어 속의 수식어', d: '15:36' },
        { t: '계단 도식 그리기 실전 ①', d: '20:12' },
        { t: '계단 도식 그리기 실전 ②', d: '19:40' }
      ] }
    ]
  },
  {
    id: 'build-3', track: 'build', level: '중급', no: 'Build 3', date: '2026-11-06',
    title: '긴 문장 조립 독해 — 에세이 · 고전 문장',
    desc: '영미 에세이와 고전 문장을 계층으로 풀고, 직독직해로 다시 조립합니다.',
    who: ['원서 · 고전을 읽고 싶은 분', '편입 · 대학원 영어를 준비하는 분'],
    learn: ['세미콜론 · 삽입구가 많은 문장', '생략된 정보 복원', '직독직해와 우리말 다듬기', '문단 단위 정보 흐름'],
    sections: [
      { title: '에세이 문장', lessons: [
        { t: 'TEXT 1 · 하숙집 노신사', d: '18:30', free: true },
        { t: 'TEXT 2 · 모든 시대의 악덕', d: '22:15' }
      ] },
      { title: '고전 문장', lessons: [
        { t: '삽입과 도치', d: '19:02' },
        { t: '생략 복원 훈련', d: '16:48' }
      ] }
    ]
  },
  {
    id: 'real-1', track: 'real', level: '중급', no: 'S & B', date: '2026-11-04',
    title: '소리로 읽고 조립으로 말하기 — 실전 낭독',
    desc: '계층으로 이해한 문장을 원어민 리듬으로 소리 내어 읽습니다. 이해와 발화를 한 번에.',
    who: ['독해는 되는데 말로는 안 나오는 분', '발표 · 낭독을 준비하는 분'],
    learn: ['정보 단계에 맞춘 끊어 읽기', '강세로 1차 정보 드러내기', '낭독 녹음과 피드백 루틴'],
    sections: [
      { title: '낭독', lessons: [
        { t: '정보 단계대로 끊어 읽기', d: '14:22', free: true },
        { t: '1차 정보에 강세를', d: '13:05' },
        { t: '긴 문장 한 호흡에 읽기', d: '17:50' }
      ] }
    ]
  }
];

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
