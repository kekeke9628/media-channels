-- 인쇄용 원본 링크 기능을 걷어낸다. 링크만 따로 붙여넣는 건 같은 파일을 두 번 다루는
-- 이중 작업이었고, 실제로 채워진 행도 없었다(적용 시점 0건). 앞으로는 현장 사진이
-- 홍보물 이미지를 겸한다.
alter table public.postings drop column if exists origin_url;
