/**
 * 这个文件专门处理人形和克隆圆的分离动画
 * 解决CSS动画的定位和计算问题
 */

function startSplitAnimation() {
    const circleWrapper = document.getElementById('skill-circle-wrapper');
    const personBody = document.getElementById('person-body');
    
    if (!circleWrapper || !personBody) return;
    
    // 1. 创建克隆圆
    const cloneCircle = document.createElement('div');
    cloneCircle.id = 'clone-circle';
    
    // 设置克隆圆初始样式
    cloneCircle.style.cssText = `
        position: absolute;
        width: 200px;
        height: 200px;
        background-color: black;
        border-radius: 50%;
        top: -200px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 95;
        opacity: 0.7;
        transition: none;
    `;
    
    circleWrapper.appendChild(cloneCircle);
    circleWrapper.classList.add('split-animation'); // 仅作为状态标记
    
    // 2. 直接控制动画，而不使用CSS类
    let startTime = null;
    const animationDuration = 1500; // 1.5秒
    
    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = Math.min(elapsed / animationDuration, 1);
        
        // 使用立方贝塞尔模拟ease-in-out效果
        const easeProgress = progress < 0.5 ? 
            2 * progress * progress : 
            -1 + (4 - 2 * progress) * progress;
        
        // 人形向左移动
        const leftDistance = -800; // 向左移动800px
        const currentLeft = -50 + easeProgress * leftDistance;
        personBody.style.transform = `translateX(${currentLeft}px) translateY(400px) scale(1)`;
        
        // 克隆圆向右移动并放大
        const rightDistance = 400; // 向右移动400px
        const scaleIncrease = 3; // 增加到原始大小的4倍
        const yOffset = 500; // 向下移动
        
        const currentRight = easeProgress * rightDistance;
        const currentScale = 1 + easeProgress * scaleIncrease;
        const currentY = easeProgress * yOffset;
        
        cloneCircle.style.transform = `translateX(${currentRight}px) translateY(${currentY}px) scale(${currentScale})`;
        cloneCircle.style.opacity = 0.7 + (0.3 * easeProgress);
        
        // 继续动画或完成
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // 动画完成，触发完成事件
            const event = new CustomEvent('splitAnimationComplete');
            circleWrapper.dispatchEvent(event);
        }
    }
    
    // 开始动画
    requestAnimationFrame(animate);
}

// 导出函数以便在main.js中使用
window.startSplitAnimation = startSplitAnimation;
