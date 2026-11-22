# 테니스 시즌 (v3)

두 갈래로 나눠 관리한다 (사장님 2026-11-22).
- **앱 (이 저장소)**: 화면·저장만. 대회·요소·측정·드릴 같은 내용은 코드에 넣지 않는다.
- **목표·훈련 프로그램**: 맥미니 `~/.aside/u/0/data/personal/tennis/program/` (PROGRAM.md, program.json). `sync_program.py push|pull|diff` 로 앱 저장소와 맞춘다. 앱에서 사장님이 고친 내용이 있을 수 있으니 프로그램을 고치기 전엔 먼저 `pull`.

- 앱: https://tennis-season.vercel.app (public/index.html + api/). 배포는 맥미니 `data/shared/deploy/deploy.sh tennis --by <세션> --no-report`.
- 저장: 비공개 Vercel Blob(tennis-season-db), 모음 logs·factors·events·settings. 레코드 단위 병합, 읽기 실패 시 쓰지 않음, 매일 backup/YYYY-MM-DD/ 사본.
- public/seed.json: 기기 등록 전 미리보기용 프로그램 사본 (sync push 가 갱신).
- 기기 등록: 앱 4자리 코드 → Aside가 `POST /api/pair {action:'approve',code}` (x-agent-key).
- Aside 기록 대행(SwingVision 캡처 등): `POST /api/db {collection:'logs', upserts:[{id,date,kind:'drill'|'rally'|'game'|'league',disc:'S'|'D',partner,min,vals:{<metricId>:값},gw,gl,res,score,note}]}`.
