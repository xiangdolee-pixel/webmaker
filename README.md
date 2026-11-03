# webmaker

E:\ws\WebMaker2 작업 프로젝트 모음 — 폴더 하나 = 웹사이트 하나.
작업 규칙은 `CLAUDE.md` (E:\ws\WebMaker\design 과 동일), 제작 기준은 `GUIDELINES.md`.

## 폴더

- pan/

## 로컬 미리보기

`서버시작.bat` 더블클릭 → http://localhost:8732 (Node.js LTS 필요)

## Cloudflare 배포

```
node build.mjs <폴더>
npx wrangler deploy
```
→ `https://<폴더이름 소문자>.master-7ce.workers.dev`
