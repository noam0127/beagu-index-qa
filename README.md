# 배구지수 v1.1.0 — 독립 시험 웹 (GitHub Pages)

이 저장소는 운영 `baeguindex.com`과 **완전히 별도**의 GitHub Pages 시험 사이트입니다.

## 통합 39~40단계 최신 결론
- [실제 인증·보안·2026 개인정보·롤백 회귀검증 종합 증거](docs/releases/v1.1.0-stage39-40-integrated-evidence-20261123.md)
- 격리 **로컬 origin**에서 실제 관리자 AAL1 → TOTP AAL2 및 일반 회원 접근 거부 테스트 통과 (Actions #45050044666)
- **공개 QA Pages는 여전히 정적 화면 전용**이며 이메일/비밀번호/실제 참여코드 입력 금지
- **일회성 호스팅 HTTPS 관리자 AAL2 E2E는 실제 통과 후 원상복구 완료** (Actions #45053847577)
- **실제 계정과 가상 추천자의 Lv3/교차권한 E2E 15/15 통과, 생성 데이터 정리 완료** (Actions #45054501623)
- **진짜 Supabase 가입 메일 Gmail 수신 확인, 확인 링크의 실제 승인 단계는 미검증** (Actions #45054796050)
- **실제 staging SQL 개인정보 승인 게이트·DB A→B→A는 통과**, 관리자 버튼과 챌린지 가입 UI는 실제 RC의 **모의 응답 Chromium 검증 통과** (Actions #45056037548)
- **시험 API의 2026 공개 지연·개인정보 실제 HTTP 검사 12/12 통과**, 종료 후 합성자료 전부 삭제·전용 기능 비활성화 (Actions #45057131311)
- **고정 RC 원본 릴리스 워커의 로컬 패키징 A→B→A→프리뷰 제거 통과**, 관리자·챌린지 Chromium 회귀 재통과 (Actions #45057400586)
- **QA Pages 실제 원격 배포 A→B→A 후 HTTPS 복구 확인 성공** (Actions #45058025567). 테스트 정적 웹만 배포, 원본 워커 패키징도 별도로 재확인. 단, 실제 staging OIDC 큐→관리자 버튼 연속 검증은 미완료.
- **시험 DB 2026 공개 근거 SQL 강화 + 직접 SQL/독립 PostgreSQL CI 검증 성공** (Actions #45059393627). 승인 해시·독립 근거·민감 문항·취소·24시간 지연·트랜잭션 롤백 통과. 운영 실데이터/사용자 E2E로 승격 금지.
- 메일 인증 링크 사용, 추천→가입→Lv3→2026 자료의 연속 실서비스 E2E, 단일 staging 배포 큐/원격 워커와 실제 관리 버튼 통합은 아직 **NO-GO**
- 일회용 인증 테스트 계정 2개 삭제, 계정 생성 API 영구 비활성화 완료

## 현재 배포 모드: 화면 검증 전용
- 고정 RC 커밋: `5c95aadad971901a8222f83c52e93bf901a3aeb7`
- 배포 패키징 도구의 검토된 소스 커밋: `640f66c844a10bd894d4f6d31d0f4601c38d5b33`
- 로그인, 이메일, 비밀번호, MFA, 모든 API 통신, 양식 제출 **금지**
- 어떤 개인정보나 운영 DB 데이터도 입력하지 마세요.
- 배포된 독립 Pages 경로: `https://noam0127.github.io/beagu-index-qa/` (GitHub 설정 후)
- 운영 GitHub Pages/CNAME, 운영 Supabase, 운영 main 브랜치를 변경하지 않습니다.

## GitHub Pages 초기 설정
Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
그다음 **Actions**에서 `QA static Pages — pinned v1.1.0 RC (NO AUTH)`를 실행하면 됩니다.
페이지가 활성화되기 전에는 배포 단계가 실패할 수 있습니다.

## 별도의 실제 인증 검증이 필요한 이유
이 빌드는 공개 정적 화면 전달만 시험합니다. 인증 가능한 시험 웹은 이 저장소의 Pages Origin이 허가된 후,
**별도 보안 검토 및 시험 Supabase Origin/CORS/redirect allowlist 설정**이 완료되어야만 구축할 수 있습니다.
현재 정적 페이지에서 임의로 인증 기능을 활성화하지 않습니다.

배포 증거: `stage38-static-mirror.json`, `stage38-release-manifest.json`에는 소스 및 안전 상태가 남습니다.
