// 머리글 페이지 탭(시세 · 크립토): 고른 칸 배경이 미끄러져 간 뒤에 페이지를 옮긴다
export function topTabs(root) {
  if (!root) return;
  const ind = root.querySelector('.seg-ind');
  const links = [...root.querySelectorAll('a')];
  const place = (a, first) => {
    if (!root.offsetWidth) { root.classList.add('no-ind'); return; }
    root.classList.remove('no-ind');
    if (first) ind.style.transition = 'none';
    ind.style.width = `${a.offsetWidth}px`;
    ind.style.transform = `translateX(${a.offsetLeft}px)`;
    if (first) { void ind.offsetWidth; ind.style.transition = ''; }
  };
  const cur = () => root.querySelector('a.on') || links[0];
  place(cur(), true);
  addEventListener('resize', () => place(cur(), true));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(cur(), true));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  links.forEach((a) => a.addEventListener('click', (e) => {
    if (a.classList.contains('on') || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    links.forEach((x) => x.classList.toggle('on', x === a));
    place(a);
    setTimeout(() => { location.href = a.href; }, reduced ? 0 : 260);
  }));
  // 뒤로 가기로 돌아왔을 때(bfcache) 원래 탭으로
  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    links.forEach((x) => x.classList.toggle('on', x.getAttribute('aria-current') === 'page'));
    place(cur(), true);
  });
}
