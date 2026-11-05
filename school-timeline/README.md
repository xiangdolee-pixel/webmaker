# 스쿨타임라인 (school-timeline)

생년월일로 초등학교 입학년도 · 지금 학년 · 초1~고3 학년도를 계산하고, 2027학년도 초등 취학 법정 일정 · 체크리스트 · 인쇄 · 일정 파일(.ics)을 제공하는 한국어 안내 사이트. 기획 원문은 `PRD.md`, 작업 지침은 `CLAUDE.md`.

- 주소: https://school-timeline.xiangdolee.workers.dev (사용자 도메인 연결 전)
- xim · xms 연결 사이트 (공통 사이트 Worker · 로그인 버튼 · 메뉴 · robots · sitemap)

## 구조

```
index.html                 첫 화면: 계산기 + 2027 요약 + 학년표
school-year/index.html     계산기 + 계산 규칙 · 예시 · 예외 · 자주 묻는 질문
admission/2027/index.html  2027 취학 대상 · 법정 일정 · 학교별 확인 항목 · 체크리스트 · 출처
methodology/ about/ privacy/ contact/   계산 기준 · 소개 · 개인정보처리방침 · 문의
404.html  _layout.html     없는 주소 · 게시판/회원 화면 틀(xms 가 <main> 에 끼움)
css/style.css              사이트 전체 CSS 하나
js/school-year.js          계산 엔진 (순수 함수, 화면 · 네트워크와 무관)
js/admission-2027.js       2027 일정 데이터 (날짜 · 법정기한/참고 · 확인 상태 · 출처 · 확인일)
js/calendar-export.js      .ics 만들기
js/app.js                  화면 동작 (계산기 · 알약 고르기 · 체크리스트 · 인쇄 · 공유)
fonts/st-sans.woff2        Pretendard(OFL)에서 사이트 글자만 남기고 이름을 바꾼 글꼴 (fonts/OFL.txt)
img/                       아이콘 · 공유 그림(og-default.png)
_dev/                      테스트 · 점검 · 글꼴/아이콘 도구 (웹에 올라가지 않음)
```

빌드 없이 그대로 열리는 HTML/CSS/JS 다. 모든 페이지 본문 · 제목 · 설명 · canonical 이 html 에 그대로 있어, 자바스크립트 없이도 검색엔진이 읽는다. 계산기만 브라우저에서 동작한다.

## 개인정보 원칙 (바꾸지 말 것)

- 생년월일 입력란에 `name` 을 두지 않는다 → 폼이 전송돼도 주소창 · 서버에 실리지 않는다 (`_dev/check-site.mjs` 가 검사).
- 계산 결과 · 체크 표시를 서버 · URL · localStorage · 분석 도구에 남기지 않는다. 공유는 페이지 주소만.
- 계산 중 네트워크로 생년월일이 나가지 않는지 E2E 가 검사한다.

## 개발 · 테스트

이 폴더에서 (Node 20 이상):

```
npm install                 # 개발 도구만 (vitest · playwright · typescript)
npx playwright install chromium   # 처음 한 번
npm run dev                 # http://localhost:8740 미리보기 (사이트를 / 로 연다)
npm test                    # 타입 검사(tsc --checkJs) + 단위 테스트(PRD 9절 사례 포함)
npm run test:e2e            # Playwright: 360 · 768 · 1280px, 320px 넘침, 키보드, 인쇄, .ics
npm run build               # 점검(check-site) + 리포 build.mjs → ../dist
```

`check-site` 가 보는 것: 페이지마다 title(중복 없음) · description · canonical(= 그 페이지 주소) · h1 하나 · 인라인 style 없음 · 내부 링크가 실제 파일로 이어짐 · 2027 일정 html 이 `js/admission-2027.js` 와 같음 · 글꼴에 없는 새 글자.

## 배포 (Cloudflare Workers, xiangdolee 계정)

리포 루트에서 — Claude 가 한다:

```
node deploy.mjs school-timeline
```

build.mjs 가 이 폴더만 모아(`.md` · `package.json` · `_dev/` · `node_modules/` 제외) 공통 사이트 Worker 와 함께 올린다. 처음 배포하면 xim 에 사이트가 등록되고 헤더 메뉴가 xms 메뉴로 들어간다.
배포 뒤 확인: `/` · `/school-year/` · `/admission/2027/` 200, `/README.md` · `/PRD.md` · `/_dev/` 404, `/robots.txt` · `/sitemap.xml` 200.

> 기획서의 Cloudflare Pages 대신 Workers(정적 파일 + Worker)를 쓴다. 이 리포의 모든 사이트가 같은 방식이고, 결과(정적 HTML 배포 · 사용자 도메인 · HTTPS)는 같다.

## 도메인 연결

1. 도메인을 Cloudflare 계정(xiangdolee)에 영역(zone)으로 추가하고 네임서버를 Cloudflare 로 바꾼다.
2. Workers & Pages → `school-timeline` → 설정 → 도메인 및 경로 → 사용자 도메인 추가(예: `schooltimeline.kr`, `www` 도 원하면 함께).
3. `node deploy.mjs --domain school-timeline` → xim 대표 도메인이 채워지고, 회원 인증 메일 · 봇 확인이 그 도메인으로 등록된다.
4. canonical · og:url · sitemap 은 들어온 주소로 자동으로 바뀌므로 html 을 고칠 필요가 없다 (canonical 은 `/school-year/` 처럼 써 두면 공통 사이트 Worker 가 전체 주소로 바꾼다).

## Search Console · 네이버 서치어드바이저 등록

1. Google Search Console → 속성 추가. **도메인 속성**이면 Cloudflare DNS 에 TXT 레코드를 넣고, **URL 접두어 속성**이면 'HTML 태그' 값을 xms 관리 화면 → 검색엔진 → 소유권 확인(구글)에 붙여 넣는다(머리에 자동으로 들어감).
2. 사이트맵 제출: `https://<도메인>/sitemap.xml` (xms 가 첫 화면 + 메뉴 페이지로 만든다).
3. URL 검사로 `/`, `/school-year/`, `/admission/2027/` 색인 요청.
4. 네이버도 같은 방식(소유권 확인 → 사이트맵 · RSS 제출).
5. 4주 동안은 색인 상태와 오류만 본다. 노출 · 클릭 · 수익은 보장되지 않는다.

## 콘텐츠 갱신

- **2027 일정이 바뀌거나 확인되면**: `js/admission-2027.js` 를 먼저 고친다(`status` · `verifiedAt`). 그다음 `admission/2027/index.html` 의 해당 항목(`data-item`)과 출처 표, `methodology/index.html` 의 표 · 수정 이력을 맞춘다. `npm run build` 가 html 과 데이터가 다르면 알려 준다.
- **확인 필요 항목**: 시행령 제16조(11월 30일 입학기일 · 통학구역 통보)는 원문을 아직 확인하지 못했다 → 확인하면 `status: 'verified'`, `verifiedAt` 을 넣는다(그러면 .ics 에도 들어감).
- **예비소집일 · 배정 학교 · 정부24 온라인 발급일**: 공식 공지를 확인하기 전에는 날짜를 넣지 않는다.
- **2028학년도**: 법령 · 공지를 새로 확인한 뒤 `admission/2028/` 과 `js/admission-2028.js` 를 손으로 만든다. 연도 숫자만 바꿔 복제하지 않는다.
- **첫 화면 학년표**는 '2026학년도' 기준이다. 2027. 3. 1. 이 지나면 2027학년도 표로 바꾼다.
- **글이 바뀌어 새 글자가 생기면** 글꼴을 다시 만든다: `pip install fonttools brotli` → `node _dev/subset-font.mjs <PretendardVariable.woff2> [python]` (원본: npm `pretendard@1.3.9` `dist/web/variable/woff2/`).
- 아이콘 · 공유 그림: `node _dev/make-icons.mjs`.
