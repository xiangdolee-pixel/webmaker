# webmaker

E:\ws\WebMaker2 작업 프로젝트 모음 — 폴더 하나 = 웹사이트 하나.
작업 규칙은 `CLAUDE.md` (E:\ws\WebMaker\design 과 동일), 제작 기준은 `GUIDELINES.md`.

## 폴더

- pan/
- sjccc/ — 나사렛장학회 (나사렛장학회.kr, 옛 xiangdolee-pixel/sjccc 리포에서 옮겨옴) · xim 연결됨
- xim/ — 고객 사이트 통합 관리(고객·사이트·정지·용량·수정요청). https://xim.xiangdolee.workers.dev , 자세한 건 xim/README.md

## 로컬 미리보기

`서버시작.bat` 더블클릭 → http://localhost:8732 (Node.js LTS 필요)

## Cloudflare 배포

xiangdolee@gmail.com 계정(f225d506…)에만 올린다.

```
node deploy.mjs <폴더>
```
