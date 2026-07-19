// Korean / English text strings + a tiny reactive locale store (Phase 2,
// PRD §6/§8). UI modules call t(key, vars) and subscribe via onLocaleChange
// so the active screen can re-render itself when the toggle is used.
// Throw-result names are NOT duplicated here — rules.js's RESULTS already
// carries both `.name` (English) and `.korean`; see resultName() below.

const STRINGS = {
  en: {
    appTitle: 'Yutnori',
    langButtonEn: 'EN',
    langButtonKo: '한국어',
    muteButton: 'Sound: On',
    unmuteButton: 'Sound: Off',

    mode: 'Mode',
    'mode.local': 'Local (hotseat)',
    'mode.ai': 'AI',
    'mode.online': 'Online',
    players: 'Players',
    playersOption: '{n} players',
    tokensPerPlayer: 'Tokens per player',
    tokensOption: '{n} tokens',
    teams: '2v2 teams (players 1+3 vs 2+4)',
    nicknames: 'Nicknames',
    playerPlaceholder: 'Player {n}',
    photoLabel: 'Photo',
    aiCheckboxLabel: 'AI-controlled',
    aiDifficulty: 'AI Difficulty',
    'aiDifficulty.easy': 'Easy',
    'aiDifficulty.medium': 'Medium',
    'aiDifficulty.hard': 'Hard',
    startGame: 'Start Game',

    onlineCreateBtn: 'Create Room',
    onlineJoinBtn: 'Join Room',
    onlineRoomCode: 'Room code',
    onlineRoomCodeLabel: 'Room code: {code}',
    onlineWaitingForPlayers: 'Waiting for players to join…',
    onlineWaitingForHost: 'Waiting for the host to start the game…',

    throwSticks: 'Throw Sticks',
    newGame: 'New Game',
    youSuffix: '(You)',
    turnBanner: "{name}'s turn",
    scoreLine: '{name}: {finished}/{total} finished',
    teamSuffix: ' (team {team})',
    noValidToken: 'No valid token for this throw — it will be discarded.',
    continueBtn: 'Continue',
    chooseToken: 'Choose a token to move ({result}):',
    newTokenEnter: 'New token (enter board)',
    tokenLabel: 'Token {id}',
    moveToLabel: '{result}: move to {dest}',
    finishLabel: 'Finish!',
    startOffBoard: 'start (off the board)',
    confirmMove: 'Confirm move',
    junctionPrompt: "Landed on a junction — choose a path for this token's next move:",
    back: 'Back',
    capturedMsg: 'Captured an opponent token! Extra throw.',
    finishedMsg: 'Token finished! Extra throw.',
    playedMsg: '{result} played.',
    backdoSuffix: '−1 (Back-do)',
    stepsSuffix: '{n} steps forward',
    victoryMsg: '🎉 {names} win{s}!',

    'junction.outer': 'Outer path (continue around)',
    'junction.shortcut': 'Shortcut (toward center)',
    'junction.continue': 'Continue through',
    'junction.cross': 'Cross shortcut (toward center)',

    rulesTitle: 'How to Play',
    rulesThrowLabel: 'Throw:',
    rulesThrow: 'Do=1, Gae=2, Geol=3, Yut=4 (extra throw), Mo=5 (extra throw). If only the marked stick lands flat, it\'s Back-do: move an on-board token back one space instead of forward.',
    rulesSequencing: 'Sequencing: Yut/Mo throws chain automatically before you assign anything; assigned captures and finishes each earn one more throw.',
    rulesShortcuts: 'Shortcuts: land exactly on a corner or the center to choose the diagonal shortcut or the outer path for that token\'s next move.',
    rulesCapturing: 'Capturing: land on an opponent\'s token to send it back to start and earn an extra throw.',
    rulesStacking: 'Stacking: land on your own token to permanently stack them — they move (and can be captured) together.',
    rulesWinning: 'Winning: first player (or team, in 2v2) to finish all of their tokens wins.',
  },
  ko: {
    appTitle: '윷놀이',
    langButtonEn: 'EN',
    langButtonKo: '한국어',
    muteButton: '소리: 켜짐',
    unmuteButton: '소리: 꺼짐',

    mode: '모드',
    'mode.local': '로컬 (한 화면)',
    'mode.ai': 'AI',
    'mode.online': '온라인',
    players: '인원',
    playersOption: '{n}인',
    tokensPerPlayer: '말 개수',
    tokensOption: '말 {n}개',
    teams: '2:2 팀 (1+3번 대 2+4번)',
    nicknames: '이름',
    playerPlaceholder: '플레이어 {n}',
    photoLabel: '사진',
    aiCheckboxLabel: 'AI 조종',
    aiDifficulty: 'AI 난이도',
    'aiDifficulty.easy': '쉬움',
    'aiDifficulty.medium': '보통',
    'aiDifficulty.hard': '어려움',
    startGame: '게임 시작',

    onlineCreateBtn: '방 만들기',
    onlineJoinBtn: '방 참가하기',
    onlineRoomCode: '방 코드',
    onlineRoomCodeLabel: '방 코드: {code}',
    onlineWaitingForPlayers: '플레이어를 기다리는 중…',
    onlineWaitingForHost: '방장이 게임을 시작하기를 기다리는 중…',

    throwSticks: '윷 던지기',
    newGame: '새 게임',
    youSuffix: '(나)',
    turnBanner: '{name}의 차례',
    scoreLine: '{name}: {finished}/{total} 완료',
    teamSuffix: ' (팀 {team})',
    noValidToken: '이 결과로 움직일 수 있는 말이 없어 버려집니다.',
    continueBtn: '계속',
    chooseToken: '움직일 말을 선택하세요 ({result}):',
    newTokenEnter: '새 말 (출발)',
    tokenLabel: '말 {id}',
    moveToLabel: '{result}: {dest}(으)로 이동',
    finishLabel: '완주!',
    startOffBoard: '출발선 (말판 밖)',
    confirmMove: '이동 확정',
    junctionPrompt: '분기점에 도착했습니다 — 다음 이동 경로를 선택하세요:',
    back: '뒤로',
    capturedMsg: '상대 말을 잡았습니다! 한 번 더 던지세요.',
    finishedMsg: '말이 완주했습니다! 한 번 더 던지세요.',
    playedMsg: '{result} 처리 완료.',
    backdoSuffix: '−1 (빽도)',
    stepsSuffix: '{n}칸 전진',
    victoryMsg: '🎉 {names} 승리{s}!',

    'junction.outer': '바깥길로 계속 (외곽)',
    'junction.shortcut': '지름길 (중앙 방향)',
    'junction.continue': '직진',
    'junction.cross': '교차 지름길 (중앙 방향)',

    rulesTitle: '노는 법',
    rulesThrowLabel: '던지기:',
    rulesThrow: '도=1, 개=2, 걸=3, 윷=4 (한 번 더), 모=5 (한 번 더). 표시된 윷가락만 엎어지면 빽도: 앞으로 가는 대신 말판 위의 말을 한 칸 뒤로 보냅니다.',
    rulesSequencing: '순서: 윷/모가 나오면 배정하기 전에 자동으로 이어서 던집니다. 잡기와 완주는 각각 한 번씩 추가로 던지게 해줍니다.',
    rulesShortcuts: '지름길: 모서리나 중앙에 정확히 도착하면 그 말의 다음 이동에서 지름길과 바깥길 중 하나를 선택합니다.',
    rulesCapturing: '잡기: 상대의 말이 있는 자리에 도착하면 그 말을 출발선으로 돌려보내고 한 번 더 던집니다.',
    rulesStacking: '업기: 자신의 말이 있는 자리에 도착하면 함께 업혀 하나로 움직이며, 함께 잡힐 수도 있습니다.',
    rulesWinning: '승리: 자신의 (2:2일 경우 팀의) 모든 말을 가장 먼저 완주시키면 승리합니다.',
  },
};

let locale = 'en';
const listeners = new Set();

export function getLocale() {
  return locale;
}

export function setLocale(next) {
  if (next !== 'en' && next !== 'ko') return;
  if (next === locale) return;
  locale = next;
  listeners.forEach((fn) => fn(locale));
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function t(key, vars) {
  const table = STRINGS[locale] || STRINGS.en;
  const str = table[key] ?? STRINGS.en[key] ?? key;
  return interpolate(str, vars);
}

/** Throw-result display name in the active locale (reuses rules.js's RESULTS data). */
export function resultName(result) {
  return locale === 'ko' ? result.korean : result.name;
}
