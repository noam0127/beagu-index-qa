# 배구지수 v1.1.0 — 독립 시험 웹 (GitHub Pages)

이 저장소는 운영 `baeguindex.com`과 **완전히 별도**의 GitHub Pages 시험 사이트입니다.

## 현재 배포 모드: 화면 검증 전용
- 고정 RC 커밋: `5c95aadad971901a8222f83c52e93bf901a3aeb7`
- 배포 패키징 도구의 검토된 소스 커밋: `640f66c844a10bd894d4f6d31d0f4601c38d5b33`
- 로그인, 이메일, 비밀번호, MFA, 모든 API 통신, 양식 제출 **금지**
- 어떤 개인정보나 운영 DB 데이터도 입력하지 마세요.
- 예상 독립 Pages 경로: `https://noam0127.github.io/beagu-index-qa/` (GitHub 설정 후)
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
