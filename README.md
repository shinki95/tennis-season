# 테니스 시즌 (v2)

단식·혼복 리그 날짜에서 거꾸로 짠 주 단위(주 3회차) 훈련 계획 + 목표 대비 진행 그래프 + 측정·경기 기록.

- 앱: Vercel 프로젝트 tennis-season (public/index.html + api/). 배포는 맥미니 `data/shared/deploy/deploy.sh tennis`.
- 저장: 비공개 Vercel Blob(tennis-season-db). `api/db.js` 레코드 단위 병합, 읽기 실패 시 쓰지 않음, 매일 backup/YYYY-MM-DD/ 사본.
- 기기 등록: 앱이 4자리 코드를 보여주면 Aside가 `POST /api/pair {action:'approve',code}` (헤더 x-agent-key, 키는 맥미니 secrets/tennis_agent_key).
- Aside 쓰기(SwingVision 캡처·영상 분석 결과): `POST /api/db {collection:'matches', upserts:[{id,date,disc:'S'|'D',kind:'league'|'practice',opp,gw,gl,res,fs,df,ue,w,src}]}`.
- v1(GitHub Pages)은 이 앱으로 넘어감.
