// 项目详情页 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // 处理封面图片加载
    const coverImage = document.getElementById('cover-image');
    const coverFallback = document.getElementById('cover-fallback');
    
    if (coverImage) {
        // 图片加载失败时显示占位符
        coverImage.addEventListener('error', function() {
            console.log('封面图片加载失败，显示占位符');
            this.classList.add('hide');
            if (coverFallback) {
                coverFallback.classList.add('show');
            }
        });
        
        // 图片加载成功时隐藏占位符
        coverImage.addEventListener('load', function() {
            console.log('封面图片加载成功');
            if (coverFallback) {
                coverFallback.classList.remove('show');
            }
            this.classList.remove('hide');
        });
        
        // 检查图片是否已经加载
        if (coverImage.complete) {
            if (coverImage.naturalWidth === 0) {
                // 图片加载失败
                coverImage.classList.add('hide');
                if (coverFallback) {
                    coverFallback.classList.add('show');
                }
            }
        }
    }
    
    console.log('项目详情页初始化完成');
});