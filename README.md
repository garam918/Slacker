# Slacker

온라인 월급 루팡 시뮬레이터입니다. 월급, 월 근무일, 하루 근무시간을 입력하면 루팡 버튼을 누른 동안의 누적 시간과 금액을 실시간으로 계산합니다.

## 웹 사이트 주소
- https://slacker-nu.vercel.app/

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- localStorage
- Firebase Firestore
- Vercel 배포 대상
- Google AdSense

## About

Slacker는 쉬는 동안 회사로부터 얼마를 벌었는지 계산해주는 웹 서비스입니다. 월급, 근무일, 근무시간을 입력하고 루팡을 시작하면 경과 시간과 누적 금액이 실시간으로 표시됩니다.

## Features

- 월급, 월 근무일, 하루 근무시간 기반 실시간 수익 계산
- 루팡 시작, 다시 일하기, 퇴근하기 상태 전환
- 오늘 하루 루팡 기록 공유 문구 생성
- 금액/시간 기준 실시간 Top 5 랭킹
- 현재 루팡 중인 사용자 수 표시
- 닉네임 설정과 부적절한 닉네임 방지
- 하루 최대 루팡 시간 14시간 제한
- 매일 자정 기준 랭킹 초기화

## Implementation

React와 TypeScript로 화면 상태와 계산 로직을 구성했고, Tailwind CSS로 간단한 계산기형 UI를 만들었습니다. 월급과 근무 조건은 localStorage에만 저장해 개인 입력값이 서버로 전송되지 않도록 했습니다.

랭킹과 현재 루팡 중인 인원은 Firebase Auth의 익명 사용자 ID와 Firestore를 이용해 처리합니다. 랭킹은 날짜별 컬렉션에 저장해 매일 자정 이후 새 랭킹으로 전환되며, 활성 사용자 수는 Firestore 집계 쿼리로 읽기 비용을 줄였습니다.

광고 영역과 SEO 메타 태그, robots.txt, sitemap.xml, 개인정보처리방침 페이지를 포함해 Vercel 배포를 기준으로 구성했습니다.
