import {
  collection,
  deleteField,
  doc,
  getCountFromServer,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'

export type RankingSort = 'amount' | 'time'

export type RankingEntry = {
  id: string
  nickname: string
  elapsedSeconds: number
  earnedAmount: number
}

type SaveRankingInput = {
  uid: string
  nickname: string
  elapsedSeconds: number
  sessionDate: string
}

function getTodayKey() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const rankingsCollection = (dateKey = getTodayKey()) => {
  if (!db) {
    throw new Error('Firebase is not configured.')
  }

  return collection(db, 'dailyRankings', dateKey, 'users')
}

export async function isNicknameAvailable(
  nickname: string,
  currentNickname: string,
  uid: string,
) {
  if (!db) {
    return true
  }

  const normalizedNickname = nickname.trim().slice(0, 12)

  if (normalizedNickname === currentNickname) {
    return true
  }

  const legacyNicknameQuery = query(
    rankingsCollection(),
    where('nickname', '==', normalizedNickname),
    limit(1),
  )
  const legacyNicknameSnapshot = await getDocs(legacyNicknameQuery)

  return legacyNicknameSnapshot.docs.every(
    (rankingDoc) => rankingDoc.id === uid,
  )
}

export async function renameRankingNickname(
  uid: string,
  currentNickname: string,
  nextNickname: string,
) {
  if (!db || currentNickname === nextNickname) {
    return
  }

  const normalizedCurrentNickname = currentNickname.trim().slice(0, 12)
  const normalizedNextNickname = nextNickname.trim().slice(0, 12)
  const currentNicknameQuery = query(
    rankingsCollection(),
    where('nickname', '==', normalizedCurrentNickname),
  )
  const currentNicknameSnapshot = await getDocs(currentNicknameQuery)
  const ownRankingRef = doc(rankingsCollection(), uid)
  const batch = writeBatch(db)

  currentNicknameSnapshot.docs.forEach((rankingDoc) => {
    batch.update(rankingDoc.ref, {
      nickname: normalizedNextNickname,
      updatedAt: serverTimestamp(),
    })
  })
  batch.set(ownRankingRef, {
    uid,
    nickname: normalizedNextNickname,
    updatedAt: serverTimestamp(),
  }, { merge: true })

  await batch.commit()
}

export async function getRankingTopPercent(elapsedSeconds: number) {
  if (!db || elapsedSeconds <= 0) {
    return null
  }

  const roundedElapsedSeconds = Math.floor(elapsedSeconds)
  const [totalSnapshot, higherSnapshot] = await Promise.all([
    getCountFromServer(rankingsCollection()),
    getCountFromServer(
      query(
        rankingsCollection(),
        where('elapsedSeconds', '>', roundedElapsedSeconds),
      ),
    ),
  ])
  const higherCount = higherSnapshot.data().count
  const estimatedRank = higherCount + 1
  const totalCount = Math.max(totalSnapshot.data().count, estimatedRank, 1)

  return Math.max(
    1,
    Math.min(100, Math.ceil((estimatedRank / totalCount) * 100)),
  )
}

export function subscribeToRankings(
  sort: RankingSort,
  onChange: (entries: RankingEntry[]) => void,
  onError: (message: string) => void,
): Unsubscribe | null {
  if (!db) {
    return null
  }

  const rankingsQuery = query(
    rankingsCollection(),
    orderBy('elapsedSeconds', 'desc'),
    limit(5),
  )

  return onSnapshot(
    rankingsQuery,
    (snapshot) => {
      const rankingsByNickname = snapshot.docs.reduce<Record<string, RankingEntry>>(
        (entries, doc) => {
          const data = doc.data()
          const nickname = String(data.nickname ?? '익명 루팡')
          const currentEntry = entries[nickname] ?? {
            id: doc.id,
            nickname,
            elapsedSeconds: 0,
            earnedAmount: 0,
          }

          entries[nickname] = {
            id: doc.id,
            nickname,
            elapsedSeconds:
              currentEntry.elapsedSeconds + Number(data.elapsedSeconds ?? 0),
            earnedAmount:
              currentEntry.earnedAmount + Number(data.earnedAmount ?? 0),
          }

          return entries
        },
        {},
      )

      onChange(
        Object.values(rankingsByNickname)
          .sort((a, b) =>
            sort === 'amount'
              ? b.earnedAmount - a.earnedAmount
              : b.elapsedSeconds - a.elapsedSeconds,
          )
          .slice(0, 5),
      )
    },
    () => {
      onError('랭킹을 불러오지 못했습니다. Firebase 설정과 Firestore 규칙을 확인해 주세요.')
    },
  )
}

export async function saveRanking(input: SaveRankingInput) {
  if (!db || input.elapsedSeconds <= 0) {
    return
  }

  const nickname = input.nickname.trim().slice(0, 12) || '익명 루팡'
  const rankingRef = doc(rankingsCollection(input.sessionDate), input.uid)

  await setDoc(rankingRef, {
    uid: input.uid,
    nickname,
    elapsedSeconds: increment(Math.floor(input.elapsedSeconds)),
    earnedAmount: deleteField(),
    salary: deleteField(),
    workDays: deleteField(),
    workHours: deleteField(),
    updatedAt: serverTimestamp(),
  }, { merge: true })
}
