/* Register the selected sticker for avatar use before updating personal info. */
async function applyRegisteredAvatar(gifId, adapters) {
  const fail = (code, errorCode = null) => {
    const error = new Error(code); error.flowCode = code; error.errorCode = errorCode; throw error;
  };
  const check = () => {
    if (!adapters.active()) fail('RESOURCE_OPERATION_CHANGED');
  };
  if (!/^[A-Za-z0-9]{64}$/.test(gifId) || !['b0701', 'b0705'].includes(gifId.slice(33, 38))) {
    fail('RESOURCE_INVALID');
  }
  const userId = adapters.accountId();
  if (!Number.isSafeInteger(userId) || userId <= 0) fail('ACCOUNT_MISSING');
  const accountCheck = () => { check(); if (adapters.accountId() !== userId) fail('RESOURCE_ACCOUNT_CHANGED'); };
  accountCheck();
  const profile = await adapters.profile(userId);
  accountCheck();
  if (!profile || typeof profile.name !== 'string' || typeof profile.avatar !== 'string') fail('RESOURCE_PROFILE_MISSING');
  adapters.report('RESOURCE_REGISTER_START');
  let registration;
  try { registration = await adapters.register(gifId); }
  catch (_) { fail('RESOURCE_REGISTER_ERROR'); }
  accountCheck();
  const code = registration?.errorCode;
  if (!registration || !Number.isInteger(registration.httpStatus) ||
      registration.httpStatus < 200 || registration.httpStatus >= 300 ||
      (code !== null && code !== undefined && Number(code) !== 0)) fail('RESOURCE_REGISTER_ERROR', code);
  const avatarId = registration.fileName;
  const expectedType = 'b03' + gifId.slice(33, 38).slice(3);
  if (typeof avatarId !== 'string' || !/^[A-Za-z0-9]{64}$/.test(avatarId) ||
      avatarId.slice(33, 38) !== expectedType) fail('RESOURCE_INVALID');
  adapters.report('RESOURCE_REGISTERED');
  let matches = false;
  try { matches = await adapters.sameContent(gifId, avatarId); }
  catch (_) { fail('RESOURCE_CONTENT_ERROR'); }
  accountCheck();
  if (!matches) fail('RESOURCE_CONTENT_ERROR');
  adapters.report('RESOURCE_CONTENT_VERIFIED');
  const latest = await adapters.profile(userId);
  accountCheck();
  if (latest?.name !== profile.name || latest?.avatar !== profile.avatar) fail('RESOURCE_PROFILE_CHANGED');
  adapters.report('API_PENDING');
  await adapters.update(userId, { name: profile.name, avatar: avatarId });
  accountCheck();
  return { avatarId };
}
