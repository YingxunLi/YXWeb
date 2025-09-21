// ============ 全局变量区域 ============
// === 常量定义 ===
const ANIMATION_CONSTANTS = {
    SCALE_THRESHOLD: 0.01,
    POSITION_THRESHOLD: 0.1,
    ROTATION_THRESHOLD: 0.01,
    INTERPOLATION_FACTOR: 0.1,
    HOVER_EFFECT_SPEED: 0.002,
    HOVER_EFFECT_AMPLITUDE: 0.003,
    MOVE_DETECTION_THRESHOLD: 0.02,
    CENTER_AREA_SIZE: 0.35,
    LOGO_DETAIL_SCALE: 0.2,
    CAMERA_MOVE_FACTOR: 0.12
};

const ROTATION_STATES = {
    YINGXUN: { x: 0, y: 0, z: 0 },
    PROJEKTE: { x: 0, y: Math.PI / 2, z: 0 },
    KONTAKT: { x: -Math.PI / 2, y: Math.PI / 2 + Math.PI / 4, z: 0 }
};

const TIMEOUT_DELAYS = {
    TRIGGER_RESET: 500
};

// === 工具函数 ===
const utils = {
    // 缓存DOM元素
    domCache: {},
    getElement(id) {
        if (!this.domCache[id]) {
            this.domCache[id] = document.getElementById(id);
        }
        return this.domCache[id];
    },
    
    // 动画插值计算
    smoothTransition(current, target, factor = ANIMATION_CONSTANTS.INTERPOLATION_FACTOR) {
        const diff = target - current;
        if (Math.abs(diff) > ANIMATION_CONSTANTS.ROTATION_THRESHOLD) {
            return current + diff * factor;
        }
        return target;
    },
    
    // 检查动画是否完成
    isAnimationComplete(diffs, threshold = ANIMATION_CONSTANTS.ROTATION_THRESHOLD) {
        return diffs.every(diff => Math.abs(diff) <= threshold);
    },
    
    // 计算总差值
    calculateTotalDiff(...diffs) {
        return diffs.reduce((sum, diff) => sum + Math.abs(diff), 0);
    }
};

// Three.js 核心对象
let scene, camera, renderer, controls;
let logo; // 3D logo模型对象

// 鼠标交互状态控制
let isHovering = false; // 鼠标是否在canvas区域内
let isHoveringLogo = false; // 鼠标是否精确悬停在logo上（通过射线检测）

// 鼠标位置和移动追踪
let mouseX = 0; // 当前鼠标X坐标（标准化为-1到1）
let lastMouseX = 0; // 上一帧的鼠标X坐标，用于计算移动方向

// 旋转控制变量
let targetRotationX = 0; // X轴目标旋转角度（上下翻转）
let targetRotationY = 0; // Y轴目标旋转角度（翻页效果）
let targetRotationZ = 0; // Z轴目标旋转角度（垂直屏幕旋转）
let currentRotationX = 0; // X轴当前旋转角度
let currentRotationY = 0; // Y轴当前旋转角度
let currentRotationZ = 0; // Z轴当前旋转角度

// 交互状态管理
let isRotating = false; // 是否正在执行旋转动画
let interactionCount = 0; // 交互次数计数器（用于控制Y轴/Z轴交替）
let hasTriggered = false; // 防止重复触发标志
let currentState = 1; // 当前状态：1=Yingxun, 2=Projekte, 3=Kontakt
let targetState = 1; // 目标状态（用于渐变过渡）
let stateProgress = 1; // 状态过渡进度（0到1）

// 详情页状态管理
let isDetailMode = false; // 是否处于详情页模式
let isTransitioningToDetail = false; // 是否正在过渡到详情页
let logoTargetScale = 1; // logo目标缩放比例
let logoCurrentScale = 1; // logo当前缩放比例
let logoTargetPosition = { x: 0, y: 0, z: 0 }; // logo目标位置
let logoCurrentPosition = { x: 0, y: 0, z: 0 }; // logo当前位置

// 时间轴相关变量
let timelineScrollProgress = 0; // 时间轴滚动进度 (0-1)
let timelineContainer = null; // 时间轴容器元素
let timelineMaxHeight = 1200; // 时间轴最大高度，用于计算滚动范围
let hasScrollControl = false; // 是否已接管页面滚动控制

// 射线检测相关对象
let raycaster = new THREE.Raycaster(); // 用于精确检测鼠标与3D物体的交互
let mouse = new THREE.Vector2(); // 标准化的鼠标坐标

// ============ 初始化函数 ============
// 设置Three.js场景、相机、渲染器等核心组件
function init() {
    // === 场景设置 ===
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // 白色背景

    // === 相机设置（正交相机，实现等角投影效果）===
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 100;
    camera = new THREE.OrthographicCamera(
        frustumSize * aspect / -2, // left
        frustumSize * aspect / 2,  // right
        frustumSize / 2,           // top
        frustumSize / -2,          // bottom
        0.1,                       // near
        1000                       // far
    );
    camera.position.set(0, 0, 50);

    // === 渲染器设置 ===
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false; // 不使用阴影
    utils.getElement('logo-container').appendChild(renderer.domElement);

    // === 控制器设置（允许用户手动旋转查看模型）===
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;

    // === 事件监听器设置 ===
    addMouseEvents();

    // === 3D模型加载 ===
    loadSTL();

    // === 启动渲染循环 ===
    animate();

    // === UI更新 ===
    utils.getElement('loading').style.display = 'none';
    
    // === 初始化导航栏 ===
    updateNavbar();
    
    // === 添加导航栏点击事件 ===
    addNavbarEvents();
}

// ============ STL文件加载函数 ============
// 负责加载和处理3D模型文件
function loadSTL() {
    const loader = new THREE.STLLoader();
    
    // 加载STL文件（请将'logo.stl'替换为您的文件路径）
    loader.load('logo.stl', function (geometry) {
        // === 模型几何处理 ===
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = box.getCenter(new THREE.Vector3());
        
        // 将几何体居中到原点
        geometry.translate(-center.x, -center.y, -center.z);

        // === 材质创建 ===
        const material = new THREE.MeshBasicMaterial({ 
            color: 0x000000, // 黑色
            side: THREE.DoubleSide
        });

        // === 3D网格创建 ===
        logo = new THREE.Mesh(geometry, material);
        scene.add(logo);

        // === 相机视野自适应调整 ===
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        // 根据模型大小调整正交相机的视野范围
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = maxDim * 4.5; // 留一些边距，logo大小
        
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.updateProjectionMatrix();

        // === 相机位置和目标设置 ===
        camera.position.set(0, 0, 50);
        camera.lookAt(0, 0, 0);
        
        controls.target.set(0, 0, 0);
        controls.update();

    }, function (progress) {
        // 加载进度回调
        console.log('加载进度: ' + (progress.loaded / progress.total * 100) + '%');
    }, function (error) {
        // 加载失败回调
        console.error('STL文件加载失败:', error);
        utils.getElement('loading').textContent = '文件加载失败，请检查STL文件路径';
    });
}

// ============ 渲染循环函数 ============
// 每帧调用，处理动画更新和渲染
function animate() {
    requestAnimationFrame(animate);
    
    if (!isDetailMode && !isTransitioningToDetail) {
        controls.update();
    }    
    // === 处理logo旋转动画效果 ===
    if (logo) {
        // === 详情页模式的缩放和位置动画 ===
        if (isTransitioningToDetail || isDetailMode) {
            // 处理缩放动画
            const scaleDiff = logoTargetScale - logoCurrentScale;
            logoCurrentScale = utils.smoothTransition(logoCurrentScale, logoTargetScale, ANIMATION_CONSTANTS.INTERPOLATION_FACTOR);
            
            // 处理位置动画
            const positionDiffs = [
                logoTargetPosition.x - logoCurrentPosition.x,
                logoTargetPosition.y - logoCurrentPosition.y,
                logoTargetPosition.z - logoCurrentPosition.z
            ];
            
            logoCurrentPosition.x = utils.smoothTransition(logoCurrentPosition.x, logoTargetPosition.x, ANIMATION_CONSTANTS.INTERPOLATION_FACTOR);
            logoCurrentPosition.y = utils.smoothTransition(logoCurrentPosition.y, logoTargetPosition.y, ANIMATION_CONSTANTS.INTERPOLATION_FACTOR);
            logoCurrentPosition.z = utils.smoothTransition(logoCurrentPosition.z, logoTargetPosition.z, ANIMATION_CONSTANTS.INTERPOLATION_FACTOR);
            
            // 应用缩放和位置到logo
            logo.scale.set(logoCurrentScale, logoCurrentScale, logoCurrentScale);
            logo.position.set(logoCurrentPosition.x, logoCurrentPosition.y, logoCurrentPosition.z);
            
            // 调试信息：每30帧输出一次位置信息
            if (Math.floor(Date.now() / 500) % 2 === 0) {
                console.log('Logo position:', logoCurrentPosition, 'Scale:', logoCurrentScale);
            }
            
            // 检查动画是否完成
            const totalDiff = utils.calculateTotalDiff(scaleDiff, ...positionDiffs);
            if (totalDiff < ANIMATION_CONSTANTS.POSITION_THRESHOLD) {
                isTransitioningToDetail = false;
                console.log('Detail mode transition completed');
            }
        }
        
        if (isRotating) {
            // 惯性旋转到目标位置（平滑过渡）
            const rotationDiffs = [
                targetRotationX - currentRotationX,
                targetRotationY - currentRotationY,
                targetRotationZ - currentRotationZ
            ];
            
            // 使用工具函数进行平滑过渡
            currentRotationX = utils.smoothTransition(currentRotationX, targetRotationX);
            currentRotationY = utils.smoothTransition(currentRotationY, targetRotationY);
            currentRotationZ = utils.smoothTransition(currentRotationZ, targetRotationZ);
            
            // 计算旋转进度并更新状态过渡
            const totalDiff = utils.calculateTotalDiff(...rotationDiffs);
            stateProgress = Math.max(0, Math.min(1, 1 - totalDiff / Math.PI)); // 进度从0到1
            
            // 实时更新导航栏
            updateNavbar();
            
            // 检查是否完成旋转
            if (utils.isAnimationComplete(rotationDiffs)) {
                isRotating = false;
                currentState = targetState; // 确保状态同步
                stateProgress = 1; // 确保进度完成
                updateNavbar(); // 最终更新
            }
        } else if (isHoveringLogo && !isDetailMode) {
            // 悬停引导效果：只有当鼠标悬停在logo上且不在详情页模式时才显示轻微摆动
            const hoverEffect = Math.sin(Date.now() * ANIMATION_CONSTANTS.HOVER_EFFECT_SPEED) * ANIMATION_CONSTANTS.HOVER_EFFECT_AMPLITUDE;
            currentRotationY += hoverEffect;
        }
        
        // 应用旋转到logo对象
        logo.rotation.x = currentRotationX;
        logo.rotation.y = currentRotationY;
        logo.rotation.z = currentRotationZ;
        
        // 确保在详情页模式下，位置和缩放始终被应用（即使在旋转时）
        if (isDetailMode || isTransitioningToDetail) {
            logo.scale.set(logoCurrentScale, logoCurrentScale, logoCurrentScale);
            logo.position.set(logoCurrentPosition.x, logoCurrentPosition.y, logoCurrentPosition.z);
        }
    }
    
    // 渲染场景
    renderer.render(scene, camera);
}

// ============ 详情页模式函数 ============
// 进入详情页模式的动画处理
function enterDetailMode() {
    if (isDetailMode || isTransitioningToDetail) return;
    
    console.log('Entering detail mode...');
    isTransitioningToDetail = true;
    isDetailMode = true;
    
    // 禁用OrbitControls
    controls.enabled = false;
    
    // 根据当前相机的视野范围计算合适的移动距离
    const cameraWidth = camera.right - camera.left;
    const moveDistance = cameraWidth * ANIMATION_CONSTANTS.CAMERA_MOVE_FACTOR; // 移动到视野宽度的12%处
    
    // 设置logo目标状态
    logoTargetScale = ANIMATION_CONSTANTS.LOGO_DETAIL_SCALE; // 缩小到20%
    logoTargetPosition.x = -moveDistance; // 动态计算移动距离
    
    // 精确计算导航栏对应的3D坐标位置
    const navbar = utils.getElement('navbar');
    if (navbar) {
        // 获取导航栏的实际DOM位置
        const navbarRect = navbar.getBoundingClientRect();
        const navbarCenterY = navbarRect.top + navbarRect.height / 2; // 导航栏中心Y坐标
        
        // 使用Three.js的方法进行精确的屏幕坐标到世界坐标转换
        const vector = new THREE.Vector3();
        
        // 将屏幕坐标转换为标准化设备坐标
        vector.x = 0; // X坐标不重要，我们只关心Y
        vector.y = -(navbarCenterY / window.innerHeight) * 2 + 1; // NDC Y坐标
        vector.z = 0; // Z坐标设为0（在相机平面上）
        
        // 使用相机的逆投影矩阵将NDC坐标转换为世界坐标
        vector.unproject(camera);
        
        // 手动微调偏移量（根据需要调整这个值）
        const manualOffset = 0; // 正值向上，负值向下，单位是3D世界坐标
        logoTargetPosition.y = vector.y + manualOffset;
        
        console.log('Navbar screen position:', navbarCenterY);
        console.log('Screen height:', window.innerHeight);
        console.log('NDC Y coordinate:', -(navbarCenterY / window.innerHeight) * 2 + 1);
        console.log('Unprojected world Y:', vector.y);
        console.log('Camera top/bottom:', camera.top, camera.bottom);
    } else {
        // 备用方案：使用CSS的top值
        const cameraHeight = camera.top - camera.bottom;
        const navbarRelativePosition = (80 / window.innerHeight - 0.5) * -1;
        logoTargetPosition.y = navbarRelativePosition * cameraHeight;
        console.log('Using fallback calculation');
    }
    
    logoTargetPosition.z = 0;
    
    console.log('Camera width:', cameraWidth);
    console.log('Target position set to:', logoTargetPosition);
    console.log('Current position:', logoCurrentPosition);
    
    // 创建时间轴（仅在Yingxun状态下）
    if (currentState === 1) {
        createTimeline();
    }
    
    // 更新导航栏状态
    updateNavbar();
}

// 退出详情页模式的动画处理
function exitDetailMode() {
    if (!isDetailMode) return;
    
    console.log('Exiting detail mode...');
    isTransitioningToDetail = true;
    isDetailMode = false;
    
    // 重新启用OrbitControls
    controls.enabled = true;
    
    // 恢复logo原始状态
    logoTargetScale = 1;
    logoTargetPosition.x = 0;
    logoTargetPosition.y = 0;
    logoTargetPosition.z = 0;
    
    // 移除时间轴
    removeTimeline();
    
    // 更新导航栏状态
    updateNavbar();
}

// ============ 时间轴相关函数 ============
// 创建时间轴
function createTimeline() {
    // 检查是否已存在时间轴容器
    if (timelineContainer) {
        removeTimeline();
    }
    
    // 创建详情页内容容器
    let detailContent = utils.getElement('detail-content');
    if (!detailContent) {
        detailContent = document.createElement('div');
        detailContent.id = 'detail-content';
        detailContent.className = 'visible';
        document.body.appendChild(detailContent);
    } else {
        detailContent.className = 'visible';
    }
    
    // 创建时间轴容器
    timelineContainer = document.createElement('div');
    timelineContainer.id = 'timeline-container';
    
    // 创建左右两条时间轴线
    const leftLine = document.createElement('div');
    leftLine.className = 'timeline-line left-line';
    timelineContainer.appendChild(leftLine);
    
    const rightLine = document.createElement('div');
    rightLine.className = 'timeline-line right-line';
    timelineContainer.appendChild(rightLine);
    
    // 定义时间轴数据 - 左右交替显示
    const timelineData = [
        { time: '09.2018', side: 'left', top: 50, title: 'Ausbildung' },
        { time: '03.2022', side: 'right', top: 150, title: 'Berufserfahrung' },
        { time: '06.2022', side: 'left', top: 280 },
        { time: '05.2022', side: 'right', top: 250 },
        { time: '07.2022', side: 'right', top: 310 },
        { time: '09.2022', side: 'right', top: 410 },
        { time: '08.2024', side: 'right', top: 440 },
        { time: '10.2024', side: 'left', top: 530 },
        { time: '11.2024', side: 'right', top: 560 },
        { time: '12.2024', side: 'right', top: 590 },
        { time: '06.2025', side: 'right', top: 690 },
        { time: '03.2028', side: 'left', top: 720 }
    ];
    
    // 添加这几行：计算所需的容器高度
    const maxTop = Math.max(...timelineData.map(item => item.top));
    const containerHeight = maxTop + 300; // 增加300px余量
    timelineContainer.style.minHeight = `${containerHeight}px`;

    // 创建标题
    const leftTitle = document.createElement('div');
    leftTitle.className = 'timeline-title left-title';
    leftTitle.textContent = 'Ausbildung';
    timelineContainer.appendChild(leftTitle);
    
    const rightTitle = document.createElement('div');
    rightTitle.className = 'timeline-title right-title';
    rightTitle.textContent = 'Berufserfahrung';
    timelineContainer.appendChild(rightTitle);
    
    // 创建时间轴项目
    timelineData.forEach((item, index) => {
        // 创建时间标签（始终在中央）
        const labelElement = document.createElement('div');
        labelElement.className = 'timeline-label';
        labelElement.textContent = item.time;
        labelElement.style.top = `${item.top}px`;
        labelElement.style.opacity = '0';
        labelElement.id = `timeline-label-${index}`;
        timelineContainer.appendChild(labelElement);
        
        // 创建时间点（在左右两侧）
        const pointElement = document.createElement('div');
        pointElement.className = `timeline-point ${item.side}-point`;
        pointElement.style.top = `${item.top}px`;
        pointElement.style.opacity = '0';
        pointElement.id = `timeline-point-${index}`;
        timelineContainer.appendChild(pointElement);
    });
    
    detailContent.appendChild(timelineContainer);
    
    // 重置滚动进度
    timelineScrollProgress = 0;
    updateTimelineDisplay();
    
    // 添加滚动事件监听
    addTimelineScrollEvents();
}

// 移除时间轴
function removeTimeline() {
    if (timelineContainer) {
        // 移除时间轴容器
        if (timelineContainer.parentNode) {
            timelineContainer.parentNode.removeChild(timelineContainer);
        }
        timelineContainer = null;
    }
    
    // 隐藏详情页内容容器
    const detailContent = utils.getElement('detail-content');
    if (detailContent) {
        detailContent.className = '';
    }
    
    // 移除滚动事件监听
    removeTimelineScrollEvents();
}

// 添加时间轴滚动事件
function addTimelineScrollEvents() {
    if (hasScrollControl) return;
    
    hasScrollControl = true;
    
    // 监听详情页内容容器的滚动事件
    const detailContent = utils.getElement('detail-content');
    if (detailContent) {
        detailContent.addEventListener('scroll', handlePageScroll, { passive: true });
    }
    
    // 重置滚动位置
    if (detailContent) {
        detailContent.scrollTop = 0;
    }
    timelineScrollProgress = 0;
}

// 移除时间轴滚动事件
function removeTimelineScrollEvents() {
    if (!hasScrollControl) return;
    
    hasScrollControl = false;
    
    // 移除详情页内容容器的滚动监听
    const detailContent = utils.getElement('detail-content');
    if (detailContent) {
        detailContent.removeEventListener('scroll', handlePageScroll);
        detailContent.scrollTop = 0;
    }
}

// 处理页面滚动
function handlePageScroll() {
    if (!isDetailMode || currentState !== 1 || !timelineContainer) return;
    
    const detailContent = utils.getElement('detail-content');
    if (!detailContent) return;
    
    const scrollTop = detailContent.scrollTop;
    const containerHeight = timelineContainer.offsetHeight;
    const viewportHeight = detailContent.clientHeight;
    
    // 简化滚动进度计算
    const scrollableHeight = containerHeight - viewportHeight;
    let newProgress = 0;
    
    if (scrollableHeight > 0) {
        newProgress = Math.min(scrollTop / scrollableHeight, 1);
    }
    
    // 允许进度减少（支持向上滚动）
    // timelineScrollProgress = newProgress;
    // 只有当进度增加时才更新（实现向下滚动时间轴出现，向上滚动不消失）
    if (newProgress > timelineScrollProgress) {
        timelineScrollProgress = newProgress;
    }
    updateTimelineDisplay();
}

// 更新时间轴显示
function updateTimelineDisplay() {
    if (!timelineContainer) return;
    
    const leftLine = timelineContainer.querySelector('.left-line');
    const rightLine = timelineContainer.querySelector('.right-line');
    const allLabels = timelineContainer.querySelectorAll('.timeline-label');
    const allPoints = timelineContainer.querySelectorAll('.timeline-point');
    
    if (!leftLine || !rightLine || allLabels.length === 0) return;
    
    // 计算当前可见的时间轴项目数量
    const totalItems = allLabels.length;
    const visibleItemsFloat = timelineScrollProgress * totalItems;
    const visibleItems = Math.floor(visibleItemsFloat);
    const currentItemProgress = visibleItemsFloat - visibleItems;
    
    // 计算时间轴线的高度
    let maxVisibleHeight = 40; // 最小高度
    
    // 更新每个时间轴项目的显示状态
    allLabels.forEach((label, index) => {
        const point = allPoints[index];
        
        if (index < visibleItems) {
            // 已完全显示的项目
            label.style.opacity = '1';
            if (point) point.style.opacity = '1';
            
            // 更新最大高度
            const itemTop = parseFloat(label.style.top) || 0;
            maxVisibleHeight = Math.max(maxVisibleHeight, itemTop + 50);
        } else if (index === visibleItems) {
            // 正在显示的项目（渐进效果）
            const opacity = currentItemProgress.toString();
            label.style.opacity = opacity;
            if (point) point.style.opacity = opacity;
            
            // 更新最大高度（渐进式）
            const itemTop = parseFloat(label.style.top) || 0;
            maxVisibleHeight = Math.max(maxVisibleHeight, itemTop + 50); 
        } else {
            // 未显示的项目保持透明
            label.style.opacity = '0';
            if (point) point.style.opacity = '0';
        }
    });
    
// 应用计算出的高度到左右时间轴线 - 修改这里
    const lineHeight = maxVisibleHeight - 40; // 减去时间轴线的起始位置(40px)
    leftLine.style.height = `${lineHeight}px`;
    rightLine.style.height = `${lineHeight}px`;
}

// ============ 鼠标事件处理函数 ============
// 控制用户与3D模型的交互
function addMouseEvents() {
    const canvas = renderer.domElement;
    
    // === 基础鼠标进入/离开事件 ===
    canvas.addEventListener('mouseenter', () => {
        isHovering = true; // 鼠标进入canvas区域
    });
    
    canvas.addEventListener('mouseleave', () => {
        isHovering = false; // 鼠标离开canvas区域
    });
    
    // === 鼠标移动事件处理 ===
    canvas.addEventListener('mousemove', (event) => {
        // --- 标准化鼠标坐标 ---
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // --- 区域检测：判断鼠标是否在画布中央70%区域内（用于导航栏显示）---
        const isInCenterArea = (Math.abs(mouse.x) <= ANIMATION_CONSTANTS.CENTER_AREA_SIZE && Math.abs(mouse.y) <= ANIMATION_CONSTANTS.CENTER_AREA_SIZE);
        
        // --- 射线检测：精确判断鼠标是否悬停在logo上（用于旋转交互）---
        if (logo) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(logo);
            isHoveringLogo = intersects.length > 0;
        }
        
        // 控制导航栏显示/隐藏（基于中央70%区域）
        const navbar = document.getElementById('navbar');
        if (navbar) {
            navbar.style.opacity = isInCenterArea ? '1' : '0';
        }
        
        // --- 手势识别：检测从右向左的移动 ---
        const currentMouseX = (event.clientX / window.innerWidth) * 2 - 1;
        
        // 只有当鼠标悬停在logo上且不在详情页模式时才能进行交互
        if (isHoveringLogo && !isRotating && !isDetailMode && !isTransitioningToDetail) {
            // 计算鼠标移动方向 (正值为向右，负值为向左)
            const deltaX = currentMouseX - lastMouseX;
            
            // 只识别从右向左的移动 (deltaX < 0) 且移动幅度足够大
            if (deltaX < -0.02 && !hasTriggered) {
                console.log('触发左移交互，deltaX:', deltaX); // 调试信息
                
                // --- 防重复触发机制 ---
                hasTriggered = true;
                isRotating = true;
                interactionCount++;
                
                // --- 旋转逻辑控制 ---
                if (interactionCount === 1) {
                    // 第一次交互：Y轴旋转90度（翻页效果）
                    targetRotationY += Math.PI / 2;
                    targetState = 2; // 设置目标状态2：Projekte
                } else if (interactionCount === 2) {
                    // 第二次交互：X轴和Y轴复合旋转
                    targetRotationX -= Math.PI / 2;
                    targetRotationY += Math.PI / 4;
                    targetState = 3; // 设置目标状态3：Kontakt
                } else if (interactionCount === 3) {
                    // 第三次交互：回到原始位置
                    targetRotationX = 0;
                    targetRotationY = 0;
                    targetRotationZ = 0;
                    targetState = 1; // 设置目标状态1：Yingxun
                } else {
                    // 第4次及以后：循环前三种状态
                    const cyclePosition = (interactionCount - 1) % 3 + 1; // 将交互次数映射到1,2,3循环
                    
                    if (cyclePosition === 1) {
                        // 相当于第一次：Y轴旋转90度
                        targetRotationX = 0;
                        targetRotationY = Math.PI / 2;
                        targetRotationZ = 0;
                        targetState = 2; // Projekte
                    } else if (cyclePosition === 2) {
                        // 相当于第二次：X轴和Y轴复合旋转
                        targetRotationX = -Math.PI / 2;
                        targetRotationY = Math.PI / 2 + Math.PI / 4;
                        targetRotationZ = 0;
                        targetState = 3; // Kontakt
                    } else if (cyclePosition === 3) {
                        // 相当于第三次：回到原始位置
                        targetRotationX = 0;
                        targetRotationY = 0;
                        targetRotationZ = 0;
                        targetState = 1; // Yingxun
                    }
                }
                
                // --- 延迟重置触发标志，防止连续触发 ---
                setTimeout(() => {
                    hasTriggered = false;
                }, 500);
                
            } else if (deltaX > 0.02) {
                console.log('检测到右移，不触发交互，deltaX:', deltaX); // 调试信息
            }
        }
        
        // --- 始终更新上一次鼠标位置（用于计算移动方向）---
        lastMouseX = currentMouseX;
    });
    
    // === 鼠标点击事件处理 ===
    canvas.addEventListener('click', (event) => {
        // --- 标准化鼠标坐标 ---
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        // --- 射线检测：检查是否点击了logo ---
        if (logo && !isRotating && !isTransitioningToDetail) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(logo);
            
            if (intersects.length > 0) {
                console.log('Logo clicked, entering detail mode'); // 调试信息
                if (isDetailMode) {
                    exitDetailMode();
                } else {
                    enterDetailMode();
                }
            }
        }
    });
}

// ============ 导航栏点击事件处理函数 ============
// 为详情页模式下的导航栏添加点击切换功能
function addNavbarEvents() {
    const navItems = {
        yingxun: document.getElementById('nav-yingxun'),
        projekte: document.getElementById('nav-projekte'),
        kontakt: document.getElementById('nav-kontakt')
    };
    
    // 为每个导航项添加点击事件
    if (navItems.yingxun) {
        navItems.yingxun.addEventListener('click', () => {
            if (isDetailMode && !isRotating) {
                switchToState(1); // 切换到状态1: Yingxun
            }
        });
    }
    
    if (navItems.projekte) {
        navItems.projekte.addEventListener('click', () => {
            if (isDetailMode && !isRotating) {
                switchToState(2); // 切换到状态2: Projekte
            }
        });
    }
    
    if (navItems.kontakt) {
        navItems.kontakt.addEventListener('click', () => {
            if (isDetailMode && !isRotating) {
                switchToState(3); // 切换到状态3: Kontakt
            }
        });
    }
}

// ============ 状态切换函数 ============
// 在详情页模式下切换到指定状态
function switchToState(newState) {
    if (currentState === newState || isRotating) return;
    
    console.log(`Switching from state ${currentState} to state ${newState}`);
    
    targetState = newState;
    isRotating = true;
    
    // 根据目标状态设置旋转参数
    if (newState === 1) {
        // 状态1: Yingxun - 原始位置
        targetRotationX = 0;
        targetRotationY = 0;
        targetRotationZ = 0;
        // 如果在详情页模式下，创建时间轴
        if (isDetailMode) {
            setTimeout(() => createTimeline(), 500); // 等待旋转完成后创建
        }
    } else if (newState === 2) {
        // 状态2: Projekte - Y轴旋转90度
        targetRotationX = 0;
        targetRotationY = Math.PI / 2;
        targetRotationZ = 0;
        // 移除时间轴
        removeTimeline();
    } else if (newState === 3) {
        // 状态3: Kontakt - X轴和Y轴复合旋转
        targetRotationX = -Math.PI / 2;
        targetRotationY = Math.PI / 2 + Math.PI / 4;
        targetRotationZ = 0;
        // 移除时间轴
        removeTimeline();
    }
    
    console.log('Target rotation set to:', {
        x: targetRotationX,
        y: targetRotationY,
        z: targetRotationZ
    });
}

// ============ 窗口大小调整函数 ============
// 当窗口大小改变时调整渲染器和相机
function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 100; // 与初始化时保持一致
    
    // 更新正交相机的视野参数
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    
    // 更新渲染器尺寸
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============ 导航栏更新函数 ============
// 根据当前状态更新导航栏文字
function updateNavbar() {
    const navbar = document.getElementById('navbar');
    const singleText = navbar.querySelector('.single-text');
    const navItems = {
        yingxun: document.getElementById('nav-yingxun'),
        projekte: document.getElementById('nav-projekte'),
        kontakt: document.getElementById('nav-kontakt')
    };
    
    if (!navbar || !singleText || !navItems.yingxun || !navItems.projekte || !navItems.kontakt) {
        console.error('导航栏元素未找到');
        return;
    }
    
    if (isDetailMode) {
        // 详情页模式：显示所有三个状态，当前状态高亮，其他状态50%透明度
        navbar.classList.add('detail-mode');
        
        // 移除所有active类
        navItems.yingxun.classList.remove('active');
        navItems.projekte.classList.remove('active');
        navItems.kontakt.classList.remove('active');
        
        // 根据当前状态添加active类
        if (currentState === 1) {
            navItems.yingxun.classList.add('active');
        } else if (currentState === 2) {
            navItems.projekte.classList.add('active');
        } else if (currentState === 3) {
            navItems.kontakt.classList.add('active');
        }
        
    } else {
        // 正常模式：显示单个状态名称
        navbar.classList.remove('detail-mode');
        
        // 状态名称数组
        const stateNames = ['', 'YINGXUN', 'PROJEKTE', 'KONTAKT'];

        if (isRotating && currentState !== targetState) {
            // 旋转中：根据进度混合显示两个状态的文字
            const fromState = currentState;
            const toState = targetState;
            
            if (stateProgress < 0.5) {
                // 前半段：显示当前状态，逐渐变透明
                singleText.textContent = stateNames[fromState];
                singleText.style.opacity = 1 - stateProgress * 2; // 从1到0
            } else {
                // 后半段：显示目标状态，逐渐显现
                singleText.textContent = stateNames[toState];
                singleText.style.opacity = (stateProgress - 0.5) * 2; // 从0到1
            }
        } else {
            // 静止状态：正常显示当前状态
            singleText.textContent = stateNames[currentState];
            singleText.style.opacity = 1;
        }
    }
}

// ============ 事件监听器注册 ============
// 注册全局事件监听器
window.addEventListener('resize', onWindowResize); // 窗口大小改变事件
window.addEventListener('load', init); // 页面加载完成事件