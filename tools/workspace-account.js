/* Bind a collection snapshot once; evaluate the live native account before every mutation. */
function nativeWorkspaceAccountId(services) {
  try {
    const id = typeof services?.accountId === 'function' ? services.accountId()
      : services?.session?.loggedIn === true ? services.session.userId : 0;
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  } catch (_) { return 0; }
}
function createWorkspaceAccountGuard(services, originalSource, currentSource) {
  const id = nativeWorkspaceAccountId(services);
  if (!id || currentSource() !== originalSource) throw Error('无法核对窗口所属账号，请刷新 SeaTalk 后重新打开。');
  return () => {
    if (nativeWorkspaceAccountId(services) !== id) throw Error('登录账号已变化，已停止操作。请刷新 SeaTalk 后重新打开。');
    return id;
  };
}
