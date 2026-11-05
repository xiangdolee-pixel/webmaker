현재 폴더의 PRD.md와 CLAUDE.md를 먼저 모두 읽어줘.

목표는 Cloudflare Pages에 올릴 수 있는 '스쿨타임라인' 한국어 웹서비스 MVP를 실제로 완성하는 것이야.

작업 순서:
1) PRD의 핵심 요구사항을 10줄 이내로 요약하고, 현재 폴더를 확인한다.
2) Astro + TypeScript + Tailwind 기반 프로젝트를 초기화한다.
3) 가장 먼저 schoolYear.ts의 순수 계산 함수와 단위 테스트를 만든다. PRD의 테스트 사례를 반드시 통과시킨다.
4) 모바일 우선 계산기/12년 타임라인/2027 입학 준비 체크리스트/인쇄/공식 법정 일정 ICS를 구현한다.
5) 각 페이지의 정적 HTML, title, description, canonical, robots.txt, sitemap.xml과 공통 정보 페이지를 작성한다.
6) npm run build, npm run test 및 주요 Playwright 테스트를 실행하고 실패를 고친다.
7) 최종으로 README에 Cloudflare Pages 배포·도메인 연결·Search Console 등록 절차를 작성한다.

절대 하지 말 것:
- 2027 예비소집일/정부24 온라인 발급일/학교 배정 정보 등을 공식 확인 없이 지어내기
- 개인 생년월일 서버 저장·분석 전송·URL 파라미터 기록
- AI로 수백 개 유사 SEO 페이지 생성하기
- 상용 광고 승인이나 검색 상위 노출을 보장하는 문구 사용하기
- PRD에 없는 타 계산기(MBTI, 키 등)까지 함께 개발하기

가능하면 1단계부터 실제 파일을 생성하며 진행해줘. 충분한 정보가 없다면 임의의 사실을 채우지 말고 확인 필요로 표시해줘.
