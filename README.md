# Slacker

온라인 월급 루팡 시뮬레이터입니다. 월급, 월 근무일, 하루 근무시간을 입력하면 루팡 버튼을 누른 동안의 누적 시간과 금액을 실시간으로 계산합니다.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- localStorage
- Firebase Firestore
- Vercel 배포 대상
- Google AdSense

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Vercel에서는 기본 Vite 설정 그대로 빌드 명령어 `npm run build`, 출력 디렉터리 `dist`를 사용하면 됩니다.

## Firebase

Firestore 랭킹을 사용하려면 `.env.local`에 Firebase 웹 앱 설정을 추가하고, Firebase Console의 Authentication에서 Anonymous provider를 활성화하세요.

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Vercel 배포 시에도 같은 값을 Project Settings의 Environment Variables에 등록해야 합니다.

랭킹 데이터는 Firestore의 `dailyRankings/{YYYY-MM-DD}/users/{uid}` 문서로 저장됩니다. 날짜별 하위 컬렉션을 사용하므로 매일 밤 12시가 지나면 새 날짜 랭킹을 읽고 씁니다. 월급, 근무일, 근무시간은 브라우저에만 저장하고 Firestore에는 저장하지 않습니다. MVP용 Firestore Rules 예시는 다음과 같습니다.

```txt
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /dailyRankings/{dateKey}/users/{uid} {
      allow read: if true;
      allow create, update: if request.auth != null &&
        request.auth.uid == uid &&
        request.resource.data.uid == request.auth.uid &&
        request.resource.data.keys().hasOnly([
          'uid',
          'nickname',
          'elapsedSeconds',
          'updatedAt'
        ]) &&
        request.resource.data.nickname is string &&
        request.resource.data.nickname.size() <= 12 &&
        (
          !('elapsedSeconds' in request.resource.data) ||
          request.resource.data.elapsedSeconds is number
        );
    }

    match /activeSlackers/{uid} {
      allow read: if true;
      allow create, update: if request.auth != null &&
        request.auth.uid == uid &&
        request.resource.data.uid == request.auth.uid &&
        request.resource.data.keys().hasOnly([
          'uid',
          'nickname',
          'activeUntil',
          'updatedAt'
        ]) &&
        request.resource.data.activeUntil is number;
    }
  }
}
```

## AdSense

`public/ads.txt`에는 다음 판매자 정보가 포함되어 있습니다.

```txt
google.com, pub-2964375076425667, DIRECT, f08c47fec0942fa0
```

광고를 표시하려면 `.env.local`과 Vercel 환경변수에 값을 추가하세요.

```bash
VITE_ADSENSE_CLIENT_ID=ca-pub-2964375076425667
VITE_ADSENSE_RANKING_SLOT=
```

`VITE_ADSENSE_RANKING_SLOT`에는 AdSense에서 생성한 Display ad unit의 `data-ad-slot` 값을 넣으면 됩니다.
