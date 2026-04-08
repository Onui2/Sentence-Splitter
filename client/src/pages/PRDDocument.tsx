import { Printer } from "lucide-react";

export default function PRDDocument() {
  return (
    <div className="min-h-screen bg-white print:bg-white">
      <div className="max-w-[780px] mx-auto px-6 py-12 print:px-4 print:py-6" data-testid="prd-document">

        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-[11px] font-medium text-blue-600 uppercase tracking-widest mb-1">기능 명세서 (인수인계용)</p>
            <h1 className="text-[26px] font-bold text-gray-900 leading-tight" data-testid="prd-title">나만의 학습지 — 기능 상세</h1>
          </div>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors print:hidden" data-testid="btn-print">
            <Printer className="w-3.5 h-3.5" /> 인쇄
          </button>
        </div>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-8">
          이 문서는 "나만의 학습지" 기능의 모든 화면, UI 요소, 동작, API를 상세히 기술합니다. 다른 개발자에게 인수인계할 때 참고할 수 있도록 작성되었습니다.
        </p>

        <div className="h-px bg-gray-200 mb-10" />

        {/* ===== 1. 전체 구조 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">1. 전체 구조 및 화면 구성</h2>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          학습지 기능은 크게 두 개의 화면으로 나뉩니다. 첫 번째는 <strong className="text-gray-800">학습지 홈 화면(WorksheetHome)</strong>이고,
          두 번째는 <strong className="text-gray-800">학습지 생성 모달(WorksheetCreate)</strong>입니다.
          별도 페이지로 이동하는 것이 아니라, 홈 화면 위에 모달이 오버레이되는 구조입니다.
          추가로 생성 모달 위에 <strong className="text-gray-800">미리보기 팝업</strong>이 한 겹 더 올라갈 수 있습니다.
        </p>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          <strong className="text-gray-800">홈 화면</strong>의 경로는 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px] text-gray-700">/worksheet</code>이며,
          좌측에 카테고리 사이드바, 우측에 학습지 목록 테이블이 표시됩니다.
          <strong className="text-gray-800">생성 모달</strong>은 홈 화면의 "학습지 만들기" 버튼을 누르면 열리며, 1100px 너비의 모달 안에
          좌측은 문항 편집 영역, 우측은 도구 패널(340px)로 구성됩니다.
          <strong className="text-gray-800">미리보기</strong>는 생성 모달의 하단 "미리보기" 버튼을 누르면 생성 모달 위에 z-index 55로 오버레이됩니다.
        </p>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          모바일(768px 미만)에서는 레이아웃이 달라집니다. 홈 화면의 카테고리 사이드바는 상시 표시 대신 좌측에서 슬라이드인되는 오버레이 드로어로 전환됩니다.
          생성 모달은 전체 화면으로 표시되며, 우측 도구 패널은 숨겨집니다. 미리보기 역시 전체 화면으로 표시됩니다.
        </p>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 2. 홈 화면 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">2. 홈 화면 (학습지 목록)</h2>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">2-1. 상단 영역</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          화면 상단에는 <strong className="text-gray-800">"학습지 만들기" 버튼</strong>이 있습니다. 파란색 버튼이며, 클릭하면 학습지 생성 모달이 열립니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          그 아래에 <strong className="text-gray-800">검색 입력창</strong>이 있습니다. 학습지 이름으로 검색할 수 있으며,
          입력하면 즉시 서버에 검색어를 전달하여 필터링합니다. 검색 입력창 오른쪽에는 현재 필터 조건에 맞는 학습지의
          <strong className="text-gray-800"> 총 개수</strong>가 "총 N개" 형태로 표시됩니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">2-2. 학습지 목록 테이블</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          테이블에는 세 개의 컬럼이 있습니다. 첫 번째는 <strong className="text-gray-800">체크박스</strong>(개별 선택용이지만 현재 일괄 작업 UI는 미구현),
          두 번째는 <strong className="text-gray-800">학습지 이름</strong>(paper.name),
          세 번째는 <strong className="text-gray-800">문항수</strong>(paper.questionCnt)입니다.
          모바일에서는 문항수 컬럼이 숨겨집니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          데이터 로딩 중에는 스켈레톤 UI가 표시되고, 학습지가 없으면 "학습지가 없습니다." 안내 문구가 나타납니다.
          페이지당 20개씩 표시되며, 2페이지 이상이면 하단에 "이전" / "다음" 페이지네이션 버튼이 표시됩니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">2-3. 좌측 카테고리 사이드바</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          PC에서는 화면 왼쪽 264px 너비로 고정 표시되고, 모바일에서는 햄버거(☰) 버튼을 누르면
          왼쪽에서 슬라이드인되는 272px 너비의 오버레이 드로어로 나타납니다.
          드로어가 열린 동안 뒤쪽 스크롤이 잠기고, 드로어 밖의 어두운 배경을 누르면 닫힙니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          사이드바 상단에는 <strong className="text-gray-800">카테고리 검색창</strong>이 있습니다.
          카테고리 이름으로 필터링되며, 매칭되는 노드와 그 상위 경로만 표시됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          검색창 아래에 <strong className="text-gray-800">"전체" 버튼</strong>이 있어 카테고리 필터를 해제하고 전체 학습지를 볼 수 있습니다.
          그 옆에 <strong className="text-gray-800">+ 버튼</strong>이 있어 최상위(루트) 카테고리를 추가할 수 있습니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          카테고리는 <strong className="text-gray-800">최대 4단계 깊이의 트리 구조</strong>로 표시됩니다.
          하위 카테고리가 있는 노드는 ▶/▼ 화살표가 표시되어 펼침/접기가 가능합니다.
          카테고리 노드를 클릭하면 해당 카테고리로 학습지 목록이 필터링되며, 선택된 카테고리는 파란색 배경으로 강조됩니다.
          하위가 있는 노드를 클릭하면 필터링과 동시에 펼침/접기도 토글됩니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">2-4. 카테고리 CRUD</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          각 카테고리 노드에 마우스를 올리면 오른쪽에 세 개의 아이콘 버튼이 나타납니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">+ (Plus) 버튼</strong>은 해당 카테고리 아래에 하위 카테고리를 추가합니다.
          누르면 해당 노드 아래에 인라인 입력창이 나타나고, Enter로 저장, Esc로 취소할 수 있습니다.
          단, 이미 3단계인 노드에서는 + 버튼이 표시되지 않습니다(4단계가 최대이므로).
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">연필(Pencil) 버튼</strong>은 카테고리 이름을 변경합니다.
          누르면 카테고리 이름이 인라인 입력창으로 바뀌고, Enter로 저장, Esc로 취소됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          <strong className="text-gray-800">휴지통(Trash) 버튼</strong>은 카테고리를 삭제합니다.
          {"\"'{카테고리명}' 카테고리를 삭제하시겠습니까?\""} 확인 다이얼로그가 뜬 뒤 삭제가 진행됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          모든 카테고리 CRUD 작업은 서버 API 호출 후 카테고리 트리가 자동으로 새로고침됩니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">2-5. 학습지 삭제</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          학습지 삭제 기능은 백엔드 API(<code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">DELETE /api/question-papers/:paperNo</code>)가 구현되어 있으나,
          현재 목록 화면에서 삭제 버튼 UI는 노출되지 않습니다. 향후 각 행에 삭제 버튼 또는 체크박스 기반 일괄 삭제 기능 추가가 필요합니다.
        </p>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 3. 생성 모달 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">3. 학습지 만들기 모달</h2>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">3-1. 모달 열림/닫힘 동작</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          홈 화면에서 "학습지 만들기" 버튼을 누르면 모달이 열립니다.
          모달이 열릴 때 모든 입력값이 초기화됩니다 — 제목은 비워지고, 문항은 빈 객관식 1개만 남습니다.
          단, 홈에서 카테고리를 선택한 상태였다면 해당 카테고리가 자동으로 설정되고,
          카테고리 경로에서 자동으로 제목도 생성됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          모달이 열린 동안 body 스크롤이 잠깁니다.
          Esc 키를 누르거나, 모달 바깥 어두운 배경을 클릭하거나, X 닫기 버튼을 누르면 닫기가 시도됩니다.
          이때 내용이 입력된 상태라면 <strong className="text-gray-800">"작성 중인 내용이 있습니다. 정말 나가시겠습니까?"</strong> 확인 다이얼로그가 표시됩니다.
          "계속 작성"을 누르면 다이얼로그가 닫히고, "나가기"를 누르면 모달이 닫힙니다.
          내용이 없으면 바로 닫힙니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">3-2. 모달 상단: 제목 + 카테고리</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          모달 제목 "학습지 만들기" 아래에 기본 설정 영역이 있습니다.
          왼쪽에 <strong className="text-gray-800">학습지 제목 입력 필드</strong>가 있으며, 필수 입력입니다.
          비어있으면 하단의 저장 버튼이 비활성화됩니다.
          카테고리를 선택하면 카테고리 경로에서 자동으로 제목이 생성되지만,
          사용자가 직접 제목을 수정하면 그 이후로는 자동 생성이 중단됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          오른쪽에 <strong className="text-gray-800">카테고리 선택 드롭다운</strong>(264px 너비)이 있습니다.
          클릭하면 아래에 카테고리 트리가 펼쳐집니다.
          트리에서 카테고리를 클릭하면 선택되고, "없음"을 선택하면 카테고리가 해제됩니다.
          드롭다운 바깥을 클릭하면 자동으로 닫힙니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          이 드롭다운 안에서도 홈 사이드바와 동일한 카테고리 CRUD가 가능합니다.
          각 노드에 마우스를 올리면 + (하위 추가), 연필 (이름변경), 휴지통 (삭제) 버튼이 나타나고,
          드롭다운 하단에 "새 카테고리" 버튼으로 루트 카테고리를 추가할 수 있습니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">3-3. 좌측: 문항 편집 영역</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          모달의 좌측 패널은 문항을 순서대로 카드 형태로 표시하며, 세로 스크롤이 가능합니다.
          상단 바에 <strong className="text-gray-800">"문항 편집 (N개)"</strong> 제목과 함께
          <strong className="text-gray-800">[+ 객관식]</strong>, <strong className="text-gray-800">[+ 주관식]</strong> 버튼이 있어
          새 문항을 목록 끝에 추가할 수 있습니다.
          모든 문항 카드 아래에도 "객관식 추가" / "주관식 추가" 링크 버튼이 있어
          스크롤 아래쪽에서도 바로 문항을 추가할 수 있습니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">3-4. 문항 카드 — 헤더</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          각 문항 카드의 상단 바에는 여러 요소가 있습니다.
          왼쪽에 <strong className="text-gray-800">문항 번호</strong>("1번", "2번", ...)가 표시되고,
          그 옆에 <strong className="text-gray-800">객관식/주관식 토글 버튼</strong>이 있습니다.
          파란색으로 현재 선택된 유형이 강조되며, 클릭하면 해당 문항의 유형이 즉시 전환됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          오른쪽에는 네 개의 작은 아이콘 버튼이 있습니다.
          <strong className="text-gray-800"> 복제(Copy)</strong> 버튼은 현재 문항을 그대로 복사해서 바로 아래에 삽입합니다.
          <strong className="text-gray-800"> 위로 이동(↑)</strong> 버튼은 문항을 한 칸 위로 이동시키며, 첫 번째 문항이면 비활성화됩니다.
          <strong className="text-gray-800"> 아래로 이동(↓)</strong> 버튼은 한 칸 아래로 이동시키며, 마지막 문항이면 비활성화됩니다.
          <strong className="text-gray-800"> 삭제(Trash)</strong> 버튼은 문항을 삭제하며, "이 문항을 삭제하시겠습니까?" 확인 다이얼로그가 뜹니다.
          단, 문항이 1개뿐이면 삭제할 수 없고 "최소 1개의 문항이 필요합니다" 안내가 표시됩니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">3-5. 문항 카드 — 공통 입력 필드</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">질문 (필수)</strong> — 문제 내용을 입력하는 텍스트 필드입니다. 빨간색 * 표시가 붙어 있습니다.
          질문이 비어있는 문항은 저장 시 무시됩니다 (입력이 완료된 문항만 저장됨).
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">카테고리 (선택)</strong> — 이 문항 개별의 카테고리를 지정하는 드롭다운입니다.
          학습지 전체 카테고리와는 별도로, 문항마다 다른 카테고리를 설정할 수 있습니다.
          클릭하면 카테고리 트리가 펼쳐지고, 노드를 클릭하면 선택됩니다.
          "없음"을 선택하면 카테고리가 해제됩니다. 이 드롭다운에서는 카테고리 CRUD(추가/수정/삭제)는 제공되지 않으며 읽기 전용입니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">보기/지문 (선택)</strong> — 긴 지문이나 본문을 입력하는 텍스트영역입니다.
          예를 들어 읽기 지문, 대화문 등을 넣을 수 있습니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          <strong className="text-gray-800">해설 (선택)</strong> — 풀이 설명을 입력하는 텍스트영역입니다.
          비어있으면 API에 전송되지 않습니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">3-6. 객관식(CHOICE) 전용 필드</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">보기항목 (필수)</strong> — ①②③④⑤ 등 원형숫자로 표시되는 선택지 목록입니다.
          기본 5개가 제공되며, [+ 추가] 버튼으로 보기를 더 추가할 수 있습니다.
          보기가 3개 이상이면 각 보기 옆에 X 버튼이 나타나 개별 삭제가 가능하지만, 최소 2개는 유지해야 합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          <strong className="text-gray-800">정답 (필수)</strong> — 원형숫자 버튼 중 정답을 클릭하여 선택합니다.
          선택된 정답 번호는 파란색 원으로 강조됩니다. 보기를 삭제하면 정답 번호가 자동으로 조정됩니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">3-7. 주관식(SHORT_ANSWER) 전용 필드</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">정답</strong> — 정답 텍스트를 직접 입력하는 필드입니다.
          빨간색 * 표시가 붙어 있지만, 현재 저장 시 정답이 비어있어도 저장은 가능합니다 (질문만 필수 검증).
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">채점기준</strong> — 4개의 체크박스 옵션이 한 줄에 표시됩니다.
        </p>
        <ul className="mb-4 space-y-1 pl-5">
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">대/소문자</strong> — 체크하면 대소문자를 구분하여 채점합니다.</li>
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">특수기호</strong> — 체크하면 특수문자 포함 여부를 채점에 반영합니다.</li>
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">띄어쓰기</strong> — 체크하면 띄어쓰기 정확도를 채점에 반영합니다.</li>
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">OR채점</strong> — 체크하면 여러 정답을 허용하는 OR 로직으로 채점합니다.</li>
        </ul>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 4. 도구 패널 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">4. 우측 도구 패널 (PC 전용, 340px)</h2>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          모바일에서는 이 도구 패널이 숨겨지며, PC에서만 표시됩니다.
          패널 상단에 톱니바퀴 아이콘과 "도구"라는 제목이 있습니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">4-1. 텍스트로 일괄 추가</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          여러 문항을 한번에 텍스트로 입력하여 추가하는 기능입니다.
          상단에 <strong className="text-gray-800">객관식/주관식 토글</strong>이 있어 일괄 추가할 문항의 유형을 먼저 선택합니다.
          그 아래에 여러 줄 입력이 가능한 <strong className="text-gray-800">텍스트영역</strong>이 있고,
          하단에 <strong className="text-gray-800">"일괄 추가" 버튼</strong>이 있습니다 (텍스트가 비어있으면 비활성화).
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">객관식 입력 형식:</strong> 한 줄에 하나의 문항을 입력합니다. 탭(Tab)으로 구분하여 "질문(탭)보기1(탭)보기2(탭)보기3" 형태로 작성합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          <strong className="text-gray-800">주관식 입력 형식:</strong> 마찬가지로 한 줄에 하나씩, "질문(탭)정답(탭)해설" 형태로 작성합니다. 정답과 해설은 생략 가능합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          파싱 후 빈 질문은 무시됩니다. 기존에 질문이 비어있는 문항들은 제거되고 새 문항이 추가됩니다.
          추가 완료 시 토스트 알림으로 "N개 문항이 추가되었습니다" 메시지가 표시됩니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">4-2. 일괄 설정</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          다섯 가지 일괄 설정 버튼이 세로로 나열되어 있습니다.
        </p>
        <ul className="mb-4 space-y-1 pl-5">
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">전체 객관식으로 변경</strong> — 모든 문항의 유형을 객관식(CHOICE)으로 일괄 변경합니다.</li>
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">전체 주관식으로 변경</strong> — 모든 문항의 유형을 주관식(SHORT_ANSWER)으로 일괄 변경합니다.</li>
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">전체 문항에 현재 카테고리 적용</strong> — 상단에서 선택한 학습지 카테고리를 모든 문항의 개별 카테고리로 복사합니다. 학습지 카테고리가 미선택이면 이 버튼 자체가 표시되지 않습니다.</li>
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">문항 순서 섞기</strong> — 모든 문항의 순서를 랜덤으로 섞습니다. 문항이 2개 미만이면 비활성화됩니다.</li>
          <li className="text-[14px] text-gray-600 leading-[1.9] list-disc"><strong className="text-gray-800">전체 초기화</strong> — 빨간색 글씨의 버튼입니다. 모든 문항을 삭제하고 빈 문항 1개로 초기화합니다.</li>
        </ul>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          모든 일괄 설정은 실행 후 토스트 알림으로 결과를 알려줍니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">4-3. 현황</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          현재 문항 상태를 실시간으로 보여주는 통계 영역입니다.
          <strong className="text-gray-800"> 전체 문항</strong>(총 문항 수),
          <strong className="text-gray-800"> 입력 완료</strong>(질문이 비어있지 않은 문항 수, 파란색 강조),
          <strong className="text-gray-800"> 객관식</strong>(CHOICE 유형 수),
          <strong className="text-gray-800"> 주관식</strong>(SHORT_ANSWER 유형 수) 네 가지 항목이 표시됩니다.
        </p>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 5. 미리보기 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">5. 미리보기 팝업</h2>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          모달 하단의 "미리보기" 버튼(눈 아이콘)을 클릭하면 열립니다.
          생성 모달 위에 z-index 55로 오버레이되는 별도의 팝업입니다.
          PC에서는 600px 너비, 모바일에서는 전체 화면으로 표시됩니다.
          바깥 어두운 배경을 클릭하면 닫힙니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          미리보기 상단에 눈 아이콘, "미리보기" 제목, 문항 수가 표시되고, 오른쪽에 X 닫기 버튼이 있습니다.
          제목이 입력된 경우 회색 배경의 헤더에 학습지 제목과 카테고리 경로가 표시됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          각 문항은 카드 형태로 표시됩니다. 문항 번호(파란색), 유형 배지(객관식=파란, 주관식=초록),
          문항별 카테고리가 설정된 경우 회색 배지로 카테고리 경로, 질문 텍스트, 지문(있으면 회색 배경),
          객관식 보기(정답은 파란색 + 체크 아이콘), 주관식 정답("정답: xxx" 파란색 텍스트),
          해설(이탤릭체)이 표시됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          입력이 완료된 문항(질문이 비어있지 않은)만 표시됩니다.
          문항이 하나도 없으면 "입력된 문항이 없습니다" 안내와 아이콘이 표시됩니다.
          하단에 "닫기" 버튼이 있습니다.
        </p>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 6. 모달 하단 바 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">6. 모달 하단 바</h2>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          모달 하단에 고정된 바가 있습니다.
          왼쪽에 <strong className="text-gray-800">"N개 문항 작성됨"</strong> 텍스트가 입력 완료된 문항 수를 실시간으로 표시합니다.
          오른쪽에 세 개의 버튼이 나란히 있습니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">[미리보기]</strong> — 눈(Eye) 아이콘이 포함된 버튼으로, 미리보기 팝업을 엽니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">[취소]</strong> — 모달을 닫습니다. 내용이 있으면 확인 다이얼로그가 뜹니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          <strong className="text-gray-800">[저장]</strong> — 파란색 버튼입니다. 학습지를 서버에 저장합니다.
          제목이 미입력이거나 입력 완료 문항이 0개이면 비활성화됩니다.
          저장 중에는 버튼 텍스트가 "저장 중..."으로 바뀌고 비활성화됩니다.
        </p>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 7. 저장 및 API ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">7. 저장 및 API 연동</h2>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">7-1. 저장 시 API 호출 흐름</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          저장 버튼을 클릭하면 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">POST /api/question-papers</code>로 요청이 전송됩니다.
          서버에서는 두 단계로 처리됩니다.
          먼저 각 문항을 개별 question으로 FlipEdu API에 등록하고,
          그 다음 생성된 question들을 묶어서 question-paper로 등록합니다.
        </p>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">7-2. 전송되는 데이터 구조</h3>

        <pre className="bg-gray-900 text-gray-100 rounded-lg px-5 py-4 text-[12px] leading-[1.8] overflow-x-auto my-4 font-mono">{`{
  title: "학습지 제목",
  categoryId: 123,                    // 학습지 전체 카테고리 (선택)
  questions: [
    {
      questionType: "CHOICE",          // 또는 "SHORT_ANSWER"
      question: "질문 내용",
      body: "지문 내용",               // 선택
      choices: ["보기1", "보기2", ...], // 객관식만
      correctAnswer: 1,                // 객관식 정답 번호 (1부터)
      answerText: "정답 텍스트",       // 주관식만
      gradingCaseSensitive: false,     // 주관식 채점옵션
      gradingSpecialChars: false,
      gradingSpacing: false,
      gradingOr: false,
      explanation: "해설",             // 선택
      tags: [],                        // 선택
      categoryId: 456                  // 문항별 카테고리 (선택)
    },
    ...
  ]
}`}</pre>

        <h3 className="text-[16px] font-bold text-gray-800 mb-3 mt-6">7-3. 서버 내부 처리</h3>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          각 문항의 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">categoryId</code>는 FlipEdu API의
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">classifyNo</code> 필드로 매핑됩니다.
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">subjectGroup</code>은 항상 "eng"로 고정됩니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          서버는 먼저 LMS(<code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">lms.flipedu.net</code>)에 시도하고,
          실패하면 Editor(<code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">editor.flipedu.app</code>)로 폴백합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          성공 시 "학습지가 생성되었습니다." 토스트가 표시되고 모달이 닫히며 목록이 새로고침됩니다.
          실패 시 빨간색 오류 토스트가 표시됩니다.
        </p>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 8. 확인 다이얼로그 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">8. 확인 다이얼로그 목록</h2>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-4">
          학습지 기능에서 사용되는 확인 다이얼로그는 세 가지입니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">1) 문항 삭제</strong> — 제목: "문항 삭제", 내용: "이 문항을 삭제하시겠습니까?",
          버튼: [취소] / [삭제](빨간색).
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <strong className="text-gray-800">2) 모달 닫기</strong> (내용이 있을 때) — 제목: "작성 취소", 내용: "작성 중인 내용이 있습니다. 정말 나가시겠습니까?",
          버튼: [계속 작성] / [나가기](빨간색).
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          <strong className="text-gray-800">3) 카테고리 삭제</strong> — 제목: "카테고리 삭제", 내용: {"\"'{카테고리명}' 카테고리를 삭제하시겠습니까?\""},
          버튼: [취소] / [삭제](빨간색).
        </p>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 9. API 엔드포인트 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">9. 관련 API 엔드포인트</h2>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">GET /api/question-paper-categories</code> — 카테고리 트리 전체를 조회합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">POST /api/question-paper-categories</code> — 새 카테고리를 생성합니다. body에 name과 parentNo(선택)를 전달합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">PUT /api/question-paper-categories/:classifyNo</code> — 카테고리 이름을 변경합니다. body에 name을 전달합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">DELETE /api/question-paper-categories/:classifyNo</code> — 카테고리를 삭제합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">GET /api/question-papers?page=0&size=20&classifyNo=X&integrateSearch=Y</code> — 학습지 목록을 조회합니다. page, size, classifyNo(카테고리 필터), integrateSearch(검색어)를 쿼리스트링으로 전달합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">POST /api/question-papers</code> — 학습지를 생성합니다. body에 title, categoryId, questions 배열을 전달합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">DELETE /api/question-papers/:paperNo</code> — 학습지를 삭제합니다. (현재 UI 미연결)
        </p>

        <div className="h-px bg-gray-100 mb-10" />

        {/* ===== 10. 파일 구조 ===== */}
        <h2 className="text-[20px] font-bold text-gray-900 mb-4">10. 관련 파일 구조</h2>

        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">client/src/pages/WorksheetHome.tsx</code> — 학습지 홈 화면입니다. 카테고리 사이드바, 학습지 목록 테이블, 검색, 카테고리 CRUD, 모바일 드로어가 모두 이 파일에 있습니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">client/src/pages/WorksheetCreate.tsx</code> — 학습지 생성 모달입니다. 문항 편집, 도구 패널, 미리보기, 카테고리 드롭다운 CRUD, 저장 로직이 모두 이 파일에 있습니다. WorksheetHome에서 import하여 사용합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-2">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">server/routes.ts</code> — 백엔드 API 라우트입니다. 카테고리 CRUD, 학습지 목록/생성/삭제 등 모든 서버 로직이 여기에 있으며, FlipEdu LMS/Editor API를 프록시합니다.
        </p>
        <p className="text-[14px] text-gray-600 leading-[1.9] mb-6">
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-[12px]">shared/routes.ts</code> — 프론트엔드와 백엔드가 공유하는 API 스키마 정의입니다. Zod 기반으로 입출력 타입이 정의되어 있습니다.
        </p>

        <div className="h-px bg-gray-200 my-10" />
        <p className="text-center text-[12px] text-gray-400 pb-8">
          나만의 학습지 기능 명세서 v1.0 — 끝
        </p>
      </div>
    </div>
  );
}
