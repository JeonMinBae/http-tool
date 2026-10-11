# cURL 변환

## 가져오기

세 가지 방법이 있다.

- 사이드바의 **Import cURL** 버튼 → 명령을 붙여넣으면 새 탭으로 연다.
- 요청의 URL 입력란에 `curl ...`을 붙여넣으면 현재 탭의 요청을 바꾼다 (이름과 스크립트는 유지).
- `curl.exe ...`(PowerShell)도 인식한다.

### 지원 옵션

| 옵션 | 해석 |
| --- | --- |
| `-X`, `--request` | 메서드 |
| `-H`, `--header` | 헤더 |
| `-d`, `--data`, `--data-raw`, `--data-ascii`, `--data-binary`, `--data-urlencode` | 바디 (Content-Type에 따라 raw 또는 urlencoded). `@파일` 하나만 주면 binary 바디 |
| `--json` | JSON 바디 + JSON 헤더 |
| `-F`, `--form`, `--form-string` | form-data (`@파일`은 파일 필드) |
| `-G`, `--get` | 데이터를 쿼리 파라미터로 |
| `-I`, `--head` | HEAD |
| `-u`, `--user` | Basic Auth |
| `-b`, `--cookie` | Cookies 탭 |
| `-A`, `--user-agent`, `-e`, `--referer` | 해당 헤더 |
| `-L`, `--location` | 리다이렉트 따라가기 |
| `-k`, `--insecure` | SSL 검증 끄기 |
| `-m`, `--max-time` | 타임아웃 |
| `--url` | URL |

bash의 작은따옴표·큰따옴표·`$'...'`, 줄 끝 `\`, cmd의 `^`, PowerShell의 `` ` ``를 처리한다. 모르는 옵션은 무시하고, 가져온 뒤 경고로 알려준다.

## 내보내기

URL 바의 **Export as cURL** 버튼으로 연다.

- 변수가 치환되고 인증과 Cookies 탭이 적용된 값으로 만든다. 그대로 다른 터미널에서 실행할 수 있다.
- 쿠키 저장소의 쿠키와 앱이 자동으로 붙이는 `User-Agent`·`Accept`는 포함하지 않는다. 실제로 나간 요청 전체는 응답의 Request 탭에서 본다.
- 프록시 설정이 있으면 `-x`, `--noproxy`가 붙는다.
- 비밀 변수 값도 평문으로 들어가니 공유할 때 주의한다.
- 셸을 고를 수 있고, 고른 셸은 기억된다 (처음에는 macOS는 bash, Windows는 cmd).
  - **bash** — macOS, Linux, Git Bash
  - **cmd** — Windows 명령 프롬프트
  - **PowerShell** — `curl.exe`를 호출한다 (`curl` 별칭이 `Invoke-WebRequest`이기 때문). PowerShell 7 이상 기준의 인용 방식이다.
- 스크립트는 포함되지 않는다. Pre 스크립트가 만든 값이 필요하면 한 번 보낸 뒤 응답의 Request 탭을 참고한다.
- OAuth 2.0은 저장된 토큰이 있을 때만 `Authorization` 헤더가 포함된다.
