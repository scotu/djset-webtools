document.getElementById('q').value = new URLSearchParams(location.search).get('q') || '';
document.getElementById('f').submit();
