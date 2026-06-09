import {
  collection,
  doc,
  getCountFromServer,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

const ACTIVE_WINDOW_MS = 90_000
const ACTIVE_COUNT_POLL_INTERVAL_MS = 30_000

type ActiveSlackerInput = {
  nickname: string
  uid: string
}

const activeSlackersCollection = () => {
  if (!db) {
    throw new Error('Firebase is not configured.')
  }

  return collection(db, 'activeSlackers')
}

export async function markActiveSlacker({ nickname, uid }: ActiveSlackerInput) {
  if (!db) {
    return
  }

  await setDoc(doc(activeSlackersCollection(), uid), {
    uid,
    nickname,
    activeUntil: Date.now() + ACTIVE_WINDOW_MS,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function markInactiveSlacker(uid: string) {
  if (!db) {
    return
  }

  await setDoc(doc(activeSlackersCollection(), uid), {
    uid,
    activeUntil: 0,
    updatedAt: serverTimestamp(),
  }, { merge: true })
}

export function subscribeToActiveSlackerCount(
  onChange: (count: number) => void,
  onError: () => void,
): (() => void) | null {
  if (!db) {
    return null
  }

  let isStopped = false

  const updateCount = async () => {
    try {
      const activeCountQuery = query(
        activeSlackersCollection(),
        where('activeUntil', '>', Date.now()),
      )
      const snapshot = await getCountFromServer(activeCountQuery)

      if (!isStopped) {
        onChange(snapshot.data().count)
      }
    } catch {
      if (!isStopped) {
        onError()
      }
    }
  }

  void updateCount()
  const intervalId = window.setInterval(
    () => void updateCount(),
    ACTIVE_COUNT_POLL_INTERVAL_MS,
  )

  return () => {
    isStopped = true
    window.clearInterval(intervalId)
  }
}
