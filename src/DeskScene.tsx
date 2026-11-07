function DeskScene({ isSlacking, isOffWork }: { isSlacking: boolean; isOffWork: boolean }) {
  return (
    <div
      className={`desk-scene min-w-0 order-2 xl:order-1 ${isOffWork ? 'off-work' : ''}`}
      role="img"
      aria-label={
        isOffWork
          ? '사용자가 떠나고 노트북과 책상만 남아있는 그림'
          : '책상에 앉아 졸고 있는 사람 그림'
      }
    >
      <div
        className={isSlacking ? 'sleep-bubble active' : 'sleep-bubble'}
      >
        Zzz
      </div>
      <div className="wall-clock">
        <span></span>
      </div>
      <div className="person">
        <div className="head">
          <span className="hair"></span>
          <span className="eye left"></span>
          <span className="eye right"></span>
          <span className="mouth"></span>
        </div>
        <div className="body"></div>
        <div className="arm"></div>
      </div>
      <div className="monitor">
        <span></span>
      </div>
      <div className="mug"></div>
      <div className="desk"></div>
    </div>
  )
}

export default DeskScene
