// 가운데 이메일을 누르면 복사
(function () {
  var btn = document.querySelector('[data-copy]');
  var toast = document.querySelector('.toast');
  if (!btn) return;
  var timer;
  function done(ok) {
    toast.textContent = ok ? '복사했어요' : '복사하지 못했어요';
    toast.classList.add('on');
    clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('on'); }, 1600);
  }
  function fallback(text) {
    var t = document.createElement('textarea');
    t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(t);
    return ok;
  }
  btn.addEventListener('click', function () {
    var text = btn.getAttribute('data-copy');
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(fallback(text)); });
    } else done(fallback(text));
  });
})();
