# 갓생메이트 📚

친구와 할 일·일정을 공유하는 플래너 (투두메이트 스타일)

## 실행 방법
`index.html` 파일을 더블클릭 → 브라우저에서 열려요.

## 파일 구조
- `index.html` — 뼈대
- `css/style.css` — 디자인 (색상은 맨 위 `:root`에서 바꿀 수 있어요)
- `js/config.js` — Supabase 주소와 공개 키
- `js/data.js` — Supabase와 데이터 주고받기 (회원, 할 일, 팔로우, 공개범위, 이모티콘, 알림, 통계)
- `js/app.js` — 화면 그리기와 버튼 동작
- `../supabase/schema.sql` — 데이터베이스 테이블과 공개범위 규칙 (Supabase SQL Editor에서 한 번 실행)

## 공개범위 규칙
서버(Supabase)에서 지켜져요. 🔒 나만 보기 일정은 다른 사람이 아예 받아갈 수 없어요.
