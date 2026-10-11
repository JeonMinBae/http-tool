# 네트워크 설정

TopBar의 설정 아이콘으로 연다. 모든 요청에 적용되며, 요청별 Settings 탭에서 일부를 덮어쓸 수 있다.

| 항목 | 기본값 | 설명 |
| --- | --- | --- |
| Timeout | 30000 ms | 0이면 제한 없음 |
| Follow redirects | 켬 | 최대 10번 |
| Verify SSL certificates | 켬 | 끄면 자체 서명·만료 인증서도 허용 |
| Proxy | System | 아래 참고 |
| History size | 500 | 1~10000 |

## 프록시

- **System** — OS 프록시 설정과 `HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` 환경 변수를 따른다.
- **None** — 프록시를 쓰지 않는다.
- **Manual** — URL을 직접 지정한다. `http://`, `https://`, `socks5://`, `socks5h://`를 지원한다. Bypass에는 `NO_PROXY` 형식으로 프록시를 거치지 않을 호스트를 쉼표로 적는다.

현재 WebSocket 연결에는 프록시 설정이 적용되지 않는다.

## 요청별 덮어쓰기

요청 편집기의 Settings 탭에서 Timeout, Follow redirects, Verify SSL을 요청마다 바꿀 수 있다. 비워 두거나 "Default"를 고르면 전역 값을 따른다.
