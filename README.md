# webmaker2

E:\ws\WebMaker2 작업 프로젝트 모음 — 폴더 하나 = 웹사이트 하나.
작업 규칙은 `CLAUDE.md` (E:\ws\WebMaker\design 과 동일), 제작 기준은 `GUIDELINES.md`.

## 폴더

- xip/ — 실시간 시세 대시보드 (https://xip.xiangdolee.workers.dev)
- sjccc/ — 나사렛장학회 (나사렛장학회.kr, 옛 xiangdolee-pixel/sjccc 리포에서 옮겨옴) · xim 연결됨
- roadbible/ — 길 성경통독 (bible.plators.com) · xim 연결됨 · 로그인 = 이 사이트 회원(xms), 기록은 /api/sync (Durable Object) · 성경 본문 bible-data.js(개역개정, 대한성서공회 무료 이용 확인)
- olivebasket/ — 올리브바스켓 (olivebasket.plators.com) · xim 연결됨 · / = 소개 페이지(로그인하면 /app 으로), /app = 구절 앱, /basket = 담기 · 로그인 = 사이트 회원(xms), 구절은 예전 D1 `olivebasket` 그대로(users.email 로 회원과 이어 붙임)
- sugarbreak/ — 슈가브레이크 (예전 Pages `blood` · `sugarbreak`, blood.plators.com) · xim 연결됨 · 관리자(레벨1)만 쓰는 건강 기록, 예전 D1 `sugarbreak` 그대로. 원본이던 E:wsblood 는 이제 안 씀
- plators/ — plators.com 도메인 연결용 한 장짜리 페이지(가운데 master@plators.com) · xim 연결됨
- xim/ — 고객 사이트 통합 관리(고객·사이트·정지·용량·수정요청). https://xim.xiangdolee.workers.dev , 자세한 건 xim/README.md
- xms/ — 업체별 홈페이지 관리(회원·게시판·메뉴). 각 사이트주소/admin/ , 자세한 건 xms/README.md

## 로컬 미리보기

`서버시작.bat` 더블클릭 → http://localhost:8732 (Node.js LTS 필요)

## Cloudflare 배포

xiangdolee@gmail.com 계정(f225d506…)에만 올린다.

```
node deploy.mjs <폴더>
```
