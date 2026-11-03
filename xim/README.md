# xim — 고객 사이트 통합 관리

주소: https://xim.xiangdolee.workers.dev (운영자 비밀번호: `%USERPROFILE%\.wrangler-xiangdolee\xim-운영자비밀번호.txt`, 리포 밖)

## 할 수 있는 것 (1단계)

- **고객** 등록 · 수정 · 삭제
- **사이트** 만들기(등록) · 수정, 저장 용량(MB) 지정, **정지 / 다시 운영**
- 사이트별 **업체 관리자 계정** 만들기 → 업체가 `사이트주소/admin/` 에서 로그인
- 업체가 남긴 **수정요청** 확인, 상태(접수 · 진행 중 · 완료) 바꾸기, 답변 달기 → 업체 화면에 보임

아직 없는 것: 용량은 숫자만 저장(업로드 기능이 생기면 그때 집계·제한), 게시판 · 메뉴 CMS, 고객 도메인 자동 연결.

## 구조

```
xim Worker (D1 "xim")
 ├─ 기본 주소        운영자 화면 index.html + /api/*
 └─ Engine (서비스 바인딩 전용, 공개 주소 없음)
       status(slug)          사이트 운영/정지 상태
       fetch                 /admin/ · /xim-api/* · 중단 화면

고객 사이트 Worker (예: sjccc)
   /admin/, /xim-api/*  → Engine
   정지된 사이트        → "서비스 일시 중단" (30초 캐시)
   그 밖                → 자기 정적 파일
```

- `_worker/index.js` — xim Worker (운영자 API + Engine)
- `_worker/schema.sql` — D1 스키마 (여러 번 실행해도 안전)
- `_worker/site-worker.js` — 고객 사이트에 복사해 넣는 Worker
- `site-admin/index.html`, `js/site-admin.js` — 업체 관리자 화면
- `index.html`, `js/app.js` — 운영자 화면, `js/common.js` · `css/style.css` 는 둘이 같이 씀

## 사이트를 xim 에 연결하기 (Claude 가 함)

1. xim 에서 사이트 만들기 (사이트 ID = WebMaker2 폴더 이름)
2. `<폴더>/_worker/index.js` ← `xim/_worker/site-worker.js` 복사
3. `<폴더>/_worker/bindings.json`
   ```json
   {
     "vars": { "XIM_SITE": "<폴더>" },
     "services": [{ "binding": "XIM", "service": "xim", "entrypoint": "Engine" }],
     "assets": { "run_worker_first": true }
   }
   ```
4. `node deploy.mjs <폴더>`

## 운영 명령 (리포 루트에서)

```
node deploy.mjs xim                                                     # 배포
node deploy.mjs --wrangler d1 execute xim --remote --file xim/_worker/schema.sql -y   # 스키마 반영
node deploy.mjs --wrangler secret put XIM_ADMIN_PASSWORD --name xim     # 운영자 비밀번호 바꾸기
```

## 무료 플랜에서 알아둘 것

- 연결된 사이트는 모든 요청에서 Worker 가 돈다(정지 확인 때문). 무료 한도: 계정 전체 하루 10만 요청.
- 비밀번호 해시(PBKDF2)는 무료 CPU 10ms 에 맞춰 반복 횟수를 낮게 잡았다. 유료로 가면 올린다.
