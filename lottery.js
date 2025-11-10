// 简洁版抽奖脚本 (lottery.js)
// 功能：控制转盘旋转、判定奖品、展示结果、领取后显示主内容。
// 去除原混淆脚本中的历史/哈希拦截、反调试等逻辑，保留核心 UI 行为。

(function() {
  // 周期性保底：每 GUARANTEE_EVERY 次必中一次特等奖（5、10、15…）。仅当前会话内有效。
  const GUARANTEE_EVERY = 5;
  // 指针位于顶部(12点方向)。CSS 的 conic-gradient 0deg 就是正上方，因此使用 0 作为对齐基准。
  // 之前误以为需要 270°，导致指向错位。改回 0。
  const POINTER_OFFSET = 0;
  let attemptCount = 0; // 当前会话内抽奖次数
  const DEBT_PER_SPIN = 50; // 每次抽奖欠款
  let totalDebt = 0; // 累计欠款
  const wheel = document.getElementById('wheel');
  const prizeResult = document.getElementById('prizeResult');
  const prizeResultText = prizeResult ? prizeResult.querySelector('.prize-result-text') : null;
  const lotteryButton = document.getElementById('lotteryButton');
  const claimButton = document.getElementById('claimButton');
  const modal = document.getElementById('modal');
  const content = document.getElementById('content');
  const audio = document.getElementById('prankAudio');
  const debtTotalEl = document.getElementById('debtTotal');

  function updateDebtUI() {
    if (debtTotalEl) {
      debtTotalEl.textContent = `🐷老板欠作者：${totalDebt} RMB`;
    }
  }

  // 分段定义：起始角度(含) 到 结束角度(不含)。与 HTML 中 --angle / --size 保持一致。
  // 指针位于 0deg 顶部，旋转后指针指向当前角度所在的 segment。
  const segments = [
    { label: '谢谢参与', start: 0, end: 55, type: 'lose' },
    { label: '再接再厉', start: 55, end: 110, type: 'lose' },
    { label: '谢谢惠顾', start: 110, end: 165, type: 'lose' },
    { label: '差一点', start: 165, end: 220, type: 'lose' },
    { label: '再来一次', start: 220, end: 270, type: 'retry' },
    { label: '特等奖', start: 270, end: 290, type: 'win' },
    { label: '谢谢惠顾', start: 290, end: 330, type: 'lose' },
    { label: '差一点点', start: 330, end: 360, type: 'lose' }
  ];

  // 根据角度找到奖品段
  function pickSegment(angle) {
    const a = ((angle % 360) + 360) % 360; // 归一化
    return segments.find(seg => a >= seg.start && a < seg.end) || segments[0];
  }

  // 随机角度（加权：按照区间长度均匀随机）
  function randomAngleInSegment(seg) {
    const span = seg.end - seg.start;
    return seg.start + Math.random() * span;
  }

  // 抽奖入口
  window.startLottery = function startLottery() {
    if (!wheel || !lotteryButton) return;
    lotteryButton.disabled = true;
    prizeResult.classList.remove('show');
    claimButton.style.display = 'none';

  attemptCount += 1; // 增加次数
  totalDebt += DEBT_PER_SPIN; // 增加欠款
    // 每 5 次必中：5、10、15 … 次时强制命中特等奖
    const guaranteedWin = (attemptCount % GUARANTEE_EVERY === 0);

    // 选段逻辑：
    // 1. 保底那一次：直接锁定特等奖，并使用固定角度（段中心），确保视觉停在红色窄区中心。
    // 2. 非保底：按照区块角度长度加权随机。
    let chosenSegment;
    let finalAngle; // 视觉与判定使用的“目标角度”（以 0deg 在 3 点方向计）
    if (guaranteedWin) {
      chosenSegment = segments.find(s => s.type === 'win');
      const winCenter = (chosenSegment.start + chosenSegment.end) / 2;
      // 固定死的角度：可以在这里微调校正（例如 +1 / -1）
      const FIXED_OFFSET = 0; // 如需再往左/右挪动，调这里（正数=逆时针，负数=顺时针视觉上微调）
      finalAngle = winCenter + FIXED_OFFSET;
    } else {
      const totalSpan = segments.reduce((sum, s) => sum + (s.end - s.start), 0);
      let r = Math.random() * totalSpan;
      for (const seg of segments) {
        const span = seg.end - seg.start;
        if (r < span) { chosenSegment = seg; break; }
        r -= span;
      }
      if (!chosenSegment) chosenSegment = segments[0];
      finalAngle = (chosenSegment.start + chosenSegment.end) / 2; // 使用中心角度避免边界错觉
    }

    const baseTurns = 5; // 基础圈数，提升动画观感
    // 将选中的角度 finalAngle（以 0deg 在顶部计）旋转到指针顶部(0deg)下
  const alignDelta = ((POINTER_OFFSET - (finalAngle % 360)) % 360 + 360) % 360; // 归一到 [0,360)
    const targetRotation = baseTurns * 360 + alignDelta;
    // 调试输出
    console.log('[lottery] attempt', attemptCount, 'guaranteed?', guaranteedWin, 'segment:', chosenSegment.label, 'finalAngle:', finalAngle, 'alignDelta:', alignDelta);
    wheel.style.transition = 'transform 4s cubic-bezier(0.25,0.1,0.25,1)';
    wheel.style.transform = `rotate(${targetRotation}deg)`;

    // 动画结束后判定结果
    setTimeout(() => {
      handlePrize(chosenSegment); // 直接使用预选结果
      updateDebtUI();
      lotteryButton.disabled = false; // 允许再次抽奖（根据需要可在赢后保持禁用）
    }, 4000);
  };

  function handlePrize(seg) {
    if (!prizeResultText) return;
    let msg;
    switch (seg.type) {
      case 'win':
        msg = `🎉 恭喜中奖：${seg.label}！🎉`;
        claimButton.style.display = 'inline-block';
        break;
      case 'retry':
        msg = `👌 ${seg.label}，再试一次！`;
        claimButton.style.display = 'none';
        break;
      default:
        msg = `😅 ${seg.label}`;
        claimButton.style.display = 'none';
        break;
    }
    prizeResultText.textContent = msg;
    prizeResult.classList.add('show');
  }

  // 领取奖品：关闭弹窗显示主内容
  window.claimPrize = function claimPrize() {
    if (modal) modal.style.display = 'none';
    if (content) content.classList.add('show');
    if (audio) {
      try { audio.play().catch(() => {}); } catch (e) {}
    }
    // 结算提示
    try { alert(`🐷老板累计欠款：${totalDebt} RMB`); } catch (e) {}
  };

  // 关闭按钮逻辑：与领取类似，但不播放音频
  window.closeModal = function closeModal() {
    if (modal) modal.style.display = 'none';
    if (content) content.classList.add('show');
  };

  // 初始：确保转盘复位
  if (wheel) {
    wheel.style.transition = 'none';
    wheel.style.transform = 'rotate(0deg)';
  }
})();
