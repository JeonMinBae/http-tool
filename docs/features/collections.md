# 컬렉션과 폴더

요청은 컬렉션 안에 파일로 저장한다. 컬렉션은 디스크의 폴더이고, 폴더 안의 하위 폴더가 그대로 트리의 폴더가 된다. 파일 형식은 [저장 구조](../storage.md).

## 컬렉션 열기와 닫기

- 사이드바의 폴더 아이콘(Open collection folder)으로 폴더를 고른다. `collection.yaml`이 없으면 만든다.
- 여러 컬렉션을 동시에 열 수 있다. 열린 컬렉션 목록은 재시작 시 복원되고, 폴더가 사라졌으면 알려준다.
- 컬렉션 우클릭 → Close Collection으로 닫는다. 폴더는 지워지지 않는다. 저장하지 않은 탭이 있으면 확인한다.

## 트리 조작

**컬렉션 메뉴:** New Request, New WebSocket, New Folder, Collection Settings, Run Collection, Copy Path, Close Collection

**폴더 메뉴:** New Request, New WebSocket, New Folder, Folder Settings, Run Folder, Rename, Duplicate, Delete

**요청 메뉴:** Rename, Duplicate, Delete

- 항목을 만들면 상위 폴더가 자동으로 펼쳐지고, 요청은 바로 탭으로 열린다.
- **드래그앤드롭:** 폴더 위에 놓으면 그 안으로 이동하고, 항목 사이에 놓으면 순서가 바뀐다. 다른 폴더로 옮기면 파일이 실제로 이동한다.
- 이름 변경은 화면 이름(`name`)과 파일·폴더 이름을 함께 바꾼다. 열린 탭은 새 경로를 따라간다.
- 삭제는 확인 후 파일·폴더를 지운다. 열린 탭은 닫히지만, 저장하지 않은 변경이 있는 요청 탭은 "저장되지 않은 요청"으로 남아 내용을 잃지 않는다.
- 드래그앤드롭은 같은 컬렉션 안에서만 된다. 컬렉션 이름 위에 놓으면 루트로 옮긴다.
- 빈 컬렉션에는 `+ Add a request` 링크가 보인다.
- 읽을 수 없는 파일이 있으면 컬렉션 이름 옆에 `⚠ 개수`가 표시되고, 마우스를 올리면 파일과 오류 내용이 보인다.

## 저장

- 저장하지 않은 새 요청(⌘N, cURL 가져오기, 히스토리에서 연 요청)을 ⌘S로 저장하면 Save As 대화상자에서 컬렉션·폴더와 이름을 고른다.
- 저장된 요청은 ⌘S로 같은 파일에 덮어쓴다.
- 앱 밖에서 파일을 고쳤다면 트리를 다시 읽을 때 반영된다. 실시간 파일 감시는 하지 않는다.

## 컬렉션·폴더 설정

Collection Settings / Folder Settings 탭에서 다음을 설정한다.

- **Auth** — 하위 요청이 `inherit`일 때 쓰는 인증. [인증](auth.md)
- **Scripts** — 하위 요청 전송 전후에 실행되는 스크립트. [스크립트](scripts.md)
- **Variables** (컬렉션만) — 컬렉션 변수. [변수와 환경](variables.md)
