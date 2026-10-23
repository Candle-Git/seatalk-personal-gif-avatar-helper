
  let sendDraft=null,sendStopped=false,sendUncertain=false,sendMonitor=null,sendPrepareGeneration=0;
  const sendMessage = code => ({
    SEND_TARGET_UNAVAILABLE:ui('无法核对当前普通会话。请打开单聊或群聊；话题窗口暂不支持发送。','The current conversation could not be verified. Open a direct or group chat; threads are not supported.'),
    SEND_TARGET_CHANGED:ui('账号或目标会话已变化，本次发送已停止。','The account or target conversation changed. This send was stopped.'),
    SEND_SELECTION_INVALID:ui('请选择 1–100 个当前收藏中的表情。','Select 1–100 stickers from your current favorites.'),
    SEND_SERVICE_UNAVAILABLE:ui('当前页面未识别到原生发送入口，请刷新后重试。','The native sticker sender is unavailable. Reload and try again.'),
    SEND_PREVIEW_FAILED:ui('表情预览未能就绪，未发送此表情。','The sticker preview is not ready. This sticker was not sent.'),
    SEND_FAILED:ui('SeaTalk 显示发送失败，已停止后续发送。','SeaTalk reported a send failure. Later sends stopped.'),
    SEND_UNCONFIRMED:ui('发送结果尚未确认，已停止。请核对聊天记录，刷新前不会再次发送。','Sending is unconfirmed and has stopped. Check the conversation. Further sends are disabled until reload.'),
  })[code] || ui('发送流程已停止，请核对聊天记录后再操作。','Sending stopped. Check the conversation before continuing.');
  function stopSendMonitor(){if(sendMonitor){sendMonitor();sendMonitor=null;}}
  function visibleSendEditor(){const editors=[...document.querySelectorAll('.messages-message-editor')].filter(node=>node.getClientRects().length);return editors.length===1;}
  function guardSend(draft){
    if(!draft || draft.invalid)throw Error('SEND_TARGET_CHANGED');
    try{
      assertWorkspaceAccount();
      if(nativeWorkspaceAccountId(draft.services)!==draft.account || !sameStickerSendTarget(draft.target,currentStickerSendTarget(draft.services,visibleSendEditor())))throw Error();
      for(const item of draft.items)if(!liveSource().list.some(row=>row.id===item.gifId || row.url===item.gifId))throw Error();
    }catch(_){draft.invalid=true;throw Error('SEND_TARGET_CHANGED');}
  }
  async function openStickerSend(selected){
    if(busy() || sendUncertain || !selected.length)return;
    if(root.querySelector('dialog[open]') && !$('#zoom').open)return;
    if($('#zoom').open)closeDialog($('#zoom'));
    const generation=++sendPrepareGeneration;sendPreparing=true;count();
    try{
      assertWorkspaceAccount();const services=await discoverShareServices();assertWorkspaceAccount();if(generation!==sendPrepareGeneration || host.dataset.open!=='true')return;
      if(typeof services.sendSticker!=='function' || typeof services.store.subscribe!=='function')throw Error('SEND_SERVICE_UNAVAILABLE');
      const target=currentStickerSendTarget(services,visibleSendEditor());
      sendDraft={services,target,account:nativeWorkspaceAccountId(services),items:selected.map(item=>Object.freeze({gifId:item.gifId,url:item.url,label:item.label})),invalid:false};
      if(sendDraft.items.length>100)throw Error('SEND_SELECTION_INVALID');guardSend(sendDraft);
      $('#sendTarget').textContent=ui('发送到：','Send to: ')+target.name;
      $('#sendSummary').textContent=ui(`将逐条发送 ${selected.length} 张表情。请核对会话和图片。`,`Send ${selected.length} stickers one at a time. Check the conversation and images.`);
      $('#sendStatus').textContent='';$('#sendPreview').replaceChildren();$('#sendConfirm').disabled=false;$('#sendStop').hidden=true;
      for(const item of sendDraft.items){const img=document.createElement('img');img.src=item.url;img.alt=item.label;img.referrerPolicy='no-referrer';$('#sendPreview').append(img);}
      if(!openDialog($('#sendConfirmation')))return;
      const watch=()=>{try{guardSend(sendDraft);}catch(_){$('#sendConfirm').disabled=true;$('#sendStatus').textContent=sendMessage('SEND_TARGET_CHANGED');}};
      const unsubscribe=services.store.subscribe(watch),timer=setInterval(watch,300);
      sendMonitor=()=>{clearInterval(timer);unsubscribe();};$('#sendCancel').focus();
    }catch(error){$('#scanStatus').textContent=sendMessage(error.message);}
    finally{sendPreparing=false;count();}
  }
  function closeSend(){if(sendingBusy){sendStopped=true;$('#sendStatus').textContent=ui('等待当前发送结果后停止。','Waiting for the current send result before stopping.');return;}stopSendMonitor();closeDialog($('#sendConfirmation'));}
  $('#sendSelected').onclick=()=>openStickerSend(selection());
  $('#sendZoom').onclick=()=>{if(zoomItem)openStickerSend([zoomItem]);};
  $('#sendClose').onclick=$('#sendCancel').onclick=closeSend;
  $('#sendStop').onclick=()=>{sendStopped=true;$('#sendStatus').textContent=ui('等待当前发送结果后停止。','Waiting for the current send result before stopping.');};
  $('#sendConfirmation').addEventListener('cancel',event=>{if(sendingBusy){event.preventDefault();closeSend();}});
  $('#sendConfirmation').addEventListener('close',()=>{if(!$('#sendConfirmation').open)stopSendMonitor();});
  $('#sendConfirm').onclick=async()=>{
    if(busy() || sendUncertain || !sendDraft || sendDraft.invalid)return;
    const draft=sendDraft;try{guardSend(draft);}catch(error){$('#sendStatus').textContent=sendMessage(error.message);return;}
    sendingBusy=true;sendStopped=false;$('#sendConfirm').disabled=true;$('#sendStop').hidden=false;render();
    let issued=0,completed=0,sendFailed=false;
    try{
      const result=await sendSelectedStickers(draft.items,{
        guard:()=>guardSend(draft),stopped:()=>sendStopped,pause:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
        preview:async item=>{
          if(globalThis.__SPGA_TEST_MODE__===true && draft.services.previewDimensions)return draft.services.previewDimensions(item);
          const img=new Image();img.referrerPolicy='no-referrer';img.src=validPreviewUrl(draft.services.fileUrl,item.gifId);
          let timer;try{await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SEND_PREVIEW_FAILED')),10000);})]);return {width:img.naturalWidth,height:img.naturalHeight};}
          catch(_){throw Error('SEND_PREVIEW_FAILED');}finally{clearTimeout(timer);}
        },
        send:(item,dimensions)=>{
          guardSend(draft);const ticket={before:new Set(Object.values(draft.services.store.getState().messages.messages||{}).map(message=>String(message.cid))),cid:null,rejected:false};
          issued++;
          Promise.resolve(draft.services.sendSticker({session:{id:draft.target.id,type:draft.target.type},customSticker:{n:'',url:item.gifId,w:dimensions.width,h:dimensions.height}})).catch(()=>ticket.rejected=true);
          return ticket;
        },
        receipt:async(item,ticket)=>{
          const deadline=Date.now()+20000;
          while(Date.now()<deadline){
            guardSend(draft);
            const receipt=findStickerSendReceipt(draft.services.store.getState().messages.messages,ticket.before,draft.target,item.gifId,draft.account,draft.services.tag,ticket.cid);
            if(receipt.cid)ticket.cid=receipt.cid;
            if(['confirmed','failed'].includes(receipt.status))return receipt.status;
            if(receipt.status==='ambiguous' || ticket.rejected)return 'pending';
            await new Promise(resolve=>setTimeout(resolve,250));
          }
          return 'pending';
        },
        report:(done,total)=>{
          completed=done;const item=items.find(item=>item.gifId===draft.items[done-1].gifId);if(item)item.selected=false;
          $('#sendStatus').textContent=ui(`已观察到 SeaTalk 确认 ${done} / ${total} 张表情。`,`SeaTalk confirmation observed for ${done} / ${total} stickers.`);render();
        },
      });
      $('#sendStatus').textContent=ui(`SeaTalk 已确认 ${result.sent} 张表情${result.stopped?'，已停止后续发送':''}。`,`SeaTalk confirmed ${result.sent} stickers.${result.stopped?' Later sends stopped.':''}`);
    }catch(error){sendFailed=true;sendUncertain=issued>completed && error.message!=='SEND_FAILED';$('#sendStatus').textContent=sendMessage(error.message)+(sendUncertain && error.message!=='SEND_UNCONFIRMED'?' '+sendMessage('SEND_UNCONFIRMED'):'');}
    finally{notifyAction($('#sendStatus').textContent,sendFailed || sendUncertain || issued>completed?'error':sendStopped?'info':'success');sendingBusy=false;$('#sendStop').hidden=true;$('#sendConfirm').disabled=true;stopSendMonitor();render();}
  };
