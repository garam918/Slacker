import {
  collection, deleteField, doc, getCountFromServer, getDoc, getDocs, limit,
  onSnapshot, orderBy, query, runTransaction, serverTimestamp, setDoc, where,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from './firebase'
import { clampSeconds, getTodayKey, nextRankingTotal, type PendingRecord } from './session'

export type RankingSort = 'amount' | 'time'
export type RankingEntry = {
  id: string
  nickname: string
  elapsedSeconds: number
  earnedAmount: number
}

const rankingsCollection = (dateKey = getTodayKey()) => {
  if (!db) throw new Error('Firebase is not configured.')
  return collection(db, 'dailyRankings', dateKey, 'users')
}

export async function isNicknameAvailable(nickname: string, currentNickname: string, uid: string) {
  if (!db || nickname.trim() === currentNickname) return true
  const snapshot = await getDocs(query(rankingsCollection(), where('nickname', '==', nickname.trim()), limit(2)))
  return snapshot.docs.every(item => item.id === uid)
}

export async function renameRankingNickname(uid: string, currentNickname: string, nextNickname: string) {
  if (!db || currentNickname === nextNickname) return
  await setDoc(doc(rankingsCollection(), uid), {
    uid, nickname: nextNickname.trim().slice(0, 12), updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function getOwnRanking(uid: string, date: string) {
  if (!db) return 0
  const snapshot = await getDoc(doc(rankingsCollection(date), uid))
  return clampSeconds(Number(snapshot.data()?.elapsedSeconds ?? 0))
}

export async function getRankingTopPercent(elapsedSeconds: number, uid: string, date = getTodayKey()) {
  if (!db || elapsedSeconds <= 0) return null
  const totalSeconds = clampSeconds(elapsedSeconds)
  const entries = rankingsCollection(date)
  const [total, higher, own] = await Promise.all([
    getCountFromServer(query(entries, where('elapsedSeconds', '>', 0))),
    getCountFromServer(query(entries, where('elapsedSeconds', '>', totalSeconds))),
    getDoc(doc(entries, uid)),
  ])
  const ownSeconds = Number(own.data()?.elapsedSeconds ?? 0)
  const rank = Math.max(0, higher.data().count - (ownSeconds > totalSeconds ? 1 : 0)) + 1
  const participants = Math.max(1, total.data().count + (ownSeconds > 0 ? 0 : 1))
  return Math.min(100, Math.max(1, Math.ceil(rank / participants * 100)))
}

export function subscribeToRankings(
  date: string,
  onChange: (entries: RankingEntry[]) => void,
  onError: (message: string) => void,
): Unsubscribe | null {
  if (!db) return null
  return onSnapshot(query(rankingsCollection(date), orderBy('elapsedSeconds', 'desc'), limit(5)),
    snapshot => onChange(snapshot.docs.map(item => ({
      id: item.id, nickname: String(item.data().nickname || '익명 루팡'),
      elapsedSeconds: clampSeconds(Number(item.data().elapsedSeconds ?? 0)), earnedAmount: 0,
    })).filter(item => item.elapsedSeconds > 0)),
    () => onError('랭킹을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'),
  )
}

export async function saveRanking(input: PendingRecord & { uid: string }) {
  if (!db) throw new Error('Firebase is not configured.')
  const rankingRef = doc(rankingsCollection(input.sessionDate), input.uid)
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(rankingRef)
    const elapsedSeconds = nextRankingTotal(Number(snapshot.data()?.elapsedSeconds ?? 0), input.totalSeconds)
    if (snapshot.exists() && elapsedSeconds === snapshot.data().elapsedSeconds) return elapsedSeconds
    transaction.set(rankingRef, {
      uid: input.uid,
      nickname: snapshot.data()?.nickname || input.nickname.trim().slice(0, 12) || '익명 루팡',
      elapsedSeconds,
      earnedAmount: deleteField(), salary: deleteField(), workDays: deleteField(), workHours: deleteField(),
      updatedAt: serverTimestamp(),
    }, { merge: true })
    return elapsedSeconds
  })
}
