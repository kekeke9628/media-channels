-- 021에서 type·이미지를 posting_variants로 옮겼다. 이제 새 코드는 postings에 이 값들을
-- 쓰지 않는다. 다만 배포돼 있는 화면이 아직 옛 코드라, 컬럼을 바로 지우면 그 사이에
-- 앱이 깨진다 — NOT NULL만 풀어 두고, 새 코드 배포·확인 뒤 023에서 실제로 제거한다.
alter table public.postings alter column type drop not null;
