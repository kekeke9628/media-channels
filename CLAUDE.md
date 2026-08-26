# media-channels — Claude Code 작업 가이드

여주 프리미엄 아울렛 **점내 홍보매체 관리 도구**. React 18 + Vite + Supabase, `main`에 푸시하면 GitHub Pages로 자동 배포. 현장(휴대폰)에서 쓰는 도구라 모바일이 1순위 화면이다.

기획 배경은 `점내홍보매체-구축사양서.md`, 초기 맥락은 `project_reference.txt`에 있다. **세션을 새로 시작하면 `git log --oneline -15`부터 읽을 것** — 현장 피드백을 받아 하루에도 여러 번 고치는 저장소라, 기억보다 커밋 히스토리가 항상 최신 진실이다.

## 데이터 모델 — 여기부터 이해할 것

**두 테이블이 전부다: `postings`(홍보물) · `placements`(배치).**
- 홍보물 = "무엇을 거는가"(업체명·내용·이미지), 배치 = "어느 매체 어느 면에 언제부터 언제까지 걸렸나".
- 021에서 `posting_variants`(매체 유형별 인쇄 파일)를 만들었다가 **024에서 되돌렸다** — 같은 디자인인데 매체 사이즈만 다른 홍보물이 끝없이 늘어나서, 규격을 아예 안 따지기로 했다(`canPlaceOn`은 항상 true). 다시 쪼개고 싶어지면 그때 이유부터 확인할 것.

**면(face)은 독립 슬롯이다.** 매체 하나(웨더워리어 등)의 1면·2면에 완전히 다른 업체가 걸릴 수 있다. DB가 `EXCLUDE USING gist (media_id, face, daterange(start,end))`로 겹침을 막고, `lib/status.js`가 (매체, 면) 단위로 상태를 계산한다. 목록 화면은 `flattenSlots(state)`로 면당 한 줄을 얻는다.

**기간이 두 종류다 — 헷갈리면 안 된다.**
| | 뜻 | 비었을 때 |
|---|---|---|
| `postings.start_date/end_date` | 캠페인 자체가 도는 기간 | 둘 다 null = **상시** |
| `placements.start_date/end_date` | 이 자리에 실제로 걸려 있던 기간 | end null = 종료일 미정 |

배치할 때 홍보물 기간을 배치 기간의 **기본값**으로 채워 주고(`placementDefaults`), 어긋나면 경고한다(`endMismatch`). 판단은 **종료일만** 본다 — 캠페인 시작 후 뒤늦게 거는 건 흔하지만, 종료일이 다르면 캠페인이 끝난 뒤에도 걸려 있다는 뜻이라 짚어야 한다.

**상태는 저장하지 않는다.** 게시중/철거예정/만료는 전부 날짜에서 파생한다(`lib/status.js`). 상태 컬럼을 추가하고 싶어지면 그게 신호다 — 파생으로 풀 수 있는지 먼저 볼 것.

**매체명이 곧 데이터다.** `DEL01` = 유형(D=듀라트란스) + E(EAST)/W(WEST) + L(LOW)/H(HIGH) + 번호. `zoneOf`/`sideOf`가 이름에서 구역을 파생하고, 이 변환은 `queries.js`의 `mapMedia` **한 곳(데이터 경계)** 에서만 한다. `zoneAt()`의 좌표 사각형은 예전 자리표시 지도용이라 26개 중 19개가 틀렸다 — 쓰지 말 것. HIGH/LOW는 층이 아니라 길 이름이다.

## 파일 지도

- `src/App.jsx` — 상태 허브. 모든 로드/변경 함수가 여기 모여 자식 패널로 내려간다. 탭: 매체 현황 / 홍보물 / 타임라인 / 매체 관리 / 알람 예정(편집자) / 관리자 관리(편집자).
- `src/lib/queries.js` — **DB·스토리지 접근은 전부 여기.** `mapPosting`/`mapMedia`가 DB 스네이크케이스를 앱 카멜케이스로 바꾸는 경계다. 컴포넌트에서 supabase를 직접 부르지 말 것.
- `src/lib/status.js` — 파생 상태(`statusOf`/`autoClose`/`buildState`/`flattenSlots`).
- `src/constants.js` — 표시·판정 헬퍼(`periodLabel`, `postingExpired`, `placementDefaults`, `endMismatch`, `installPhotoRequired`, `zoneOf`, `byName`, `nameTaken` 등). 새 판정 규칙은 컴포넌트가 아니라 여기에.
- `src/components/` — 화면. 모달은 `AddModal`(홍보물 등록+즉시 배치) / `AssignModal`(홍보물→매체) / `PlaceOnMediaModal`(매체→홍보물) 셋이 비슷하지만 방향이 달라 따로 둔다. **기간·사진 규칙을 고치면 세 곳 다 고쳐야 한다.**
- `supabase/migrations/` — 번호순. 새 마이그레이션은 파일로 남기고 Supabase MCP `apply_migration`으로도 적용해야 실제 DB에 반영된다(둘 중 하나만 하면 어긋난다).

## 코드 컨벤션

- **주석은 "무엇"이 아니라 "왜"를 남긴다.** 무엇을 바꿨는지는 diff가 말해 준다. 이 저장소 주석은 대부분 "이렇게 안 했더니 이런 사고가 났다"를 적어 둔 것이고, 그게 다음 사람을 구한다.
- 커밋 메시지는 한국어 `type: 설명`(`feat:`/`fix:`/`chore:`), 본문에 원인·재현 경위. 의미 단위로 나눠서 커밋한다.
- 사용자는 현장 사용자다. 화면에 뜨는 문구는 전부 한국어 존댓말, 전문용어 대신 현장 용어(면/매체/홍보물/철거).
- **모바일 우선**: 터치 대상은 44px 목표(`.mini`는 모바일에서 패딩을 키운다). 좁은 화면 넘침은 `min-width:0`을 먼저 의심할 것.

## 밟았던 지뢰 (반복 금지)

- **`<label>` 안에 버튼을 두 개 넣지 말 것.** 브라우저가 label의 첫 폼 요소로 클릭을 한 번 더 보낸다 — 앞 버튼이 눌려 사라지면 그 클릭이 옆 버튼에 떨어진다. 제목+버튼 줄은 `<div className="fld"><span className="fldhead">`를 쓴다.
- **JSX children은 부모가 먼저 평가한다.** `{result && children}`로 감싼 컴포넌트라도 `children` 안에서 `result.orig`를 읽으면 그 자리에서 터진다(홍보물 등록 화이트스크린 사고). children 쪽에서도 가드할 것.
- **`input[type=date]`**: iOS는 고유 폭 때문에 칸이 밀려나가서 `-webkit-appearance:none`이 필요한데(그래서 `@supports (-webkit-touch-callout: none)`으로 감쌌다), 그러면 **값이 없을 때 아무것도 안 그린다**. 비어 있을 수 있는 날짜칸은 `.datefld`로 감싸 "날짜 선택" 자리표시를 깔아 준다. 데스크톱에 그 글자를 넣으면 브라우저 자리표시와 겹친다.
- **CSS 자식 선택자를 아끼지 말 것**: `.statgrid div`(후손)가 버튼 래퍼까지 잡아 칸이 51→189px로 부풀었다. `>`로 직접 자식만.
- **접기는 화면만 접는 것이다** — 접었다고 입력값을 지우면 안 된다. 값을 비우는 건 별도 버튼(`상시로`).
- 목록 정렬은 항상 명시할 것. `fetchMedia()`에 `ORDER BY`가 없어서 중복 매체가 서로 떨어져 보였고, 사용자가 중복인 걸 못 봤다.

## 테스트 — 하네스 방식

별도 테스트 러너가 없다. **일회용 Playwright 하네스**로 실제 브라우저에서 확인하고 지운다.

1. `hX/`(임의 이름) 디렉터리 + `vite.hX.config.js`를 만든다. `root: 'hX'`, alias로 DB를 목으로 갈아끼운다:
   `{ find: /^.*\/lib\/queries\.js$/, replacement: '/mockQueries.js' }` — **앞의 `^.*`가 없으면** 상대경로가 깨진다.
2. `hX/main.jsx`에서 검증할 컴포넌트만 마운트한다(앱 전체보다 훨씬 빠르다).
3. `playwright-core`로 구동. 브라우저는 `executablePath: '/opt/pw-browsers/chromium'` (설치하지 말 것).
4. **커밋 전에 `hX/`와 `vite.hX.config.js`를 반드시 지운다.**

주장하기 전에 재현: `getBoundingClientRect()`·`getComputedStyle()`·`elementFromPoint()`로 실측하고, DB는 정합성 SQL을 돌려 확인한다. "고쳤다"는 측정 결과가 있을 때만 쓴다.

## 배포·환경

- `main` 푸시 → GitHub Pages 자동 배포(`.github/workflows/deploy-pages.yml`). `vite.config.js`의 `base`가 `/media-channels/`라 저장소 이름을 바꾸면 같이 고쳐야 한다.
- 매일 09:00 KST 슬랙 알람(`slack-alert.yml`). 알람 조회 **직전에** `scripts/auto-remove.mjs`를 먼저 돌린다 — 기록 누락이 "만료"로 잘못 잡히지 않게.
- `.env`는 gitignore. `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`가 필요하고, 같은 값이 GitHub Secrets에도 있어야 배포가 된다.
- Supabase 프로젝트 ref `sjxggjxexrchtvnbpxwr`, **free plan**(유출 비밀번호 차단 등 Pro 전용 기능은 못 켠다).
- **이 실행 환경에서는 `supabase.co`로 나가는 요청을 조직 프록시가 막는다**(CONNECT 403). 즉 Storage API에 직접 못 붙는다. DB 작업은 Supabase MCP(`execute_sql`/`apply_migration`)로 하고, **프록시 우회·TLS 검증 해제는 하지 말 것.** 스토리지 정리는 앱 안의 `cleanupOrphanImages()` 경로로 처리한다.

## 열려 있는 것

- 목록·상세에서 구역(EAST LOW 등) 표시를 뺄지 미정 — 사용자가 "구역 필요없어"라고 했지만 어디까지 뺄지는 안 정했다.
- 지도 이미지를 '전체 그대로' 모드로 다시 업로드하면 잘리지 않은 원본을 쓸 수 있다(현재 것은 예전 2:1 크롭).
- 최초 로그인 시 비밀번호 강제 변경 — 사용자가 "나중에 하자"로 미뤄 둠.
