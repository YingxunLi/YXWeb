// ============ 全局变量区域 ============
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
    document.getElementById('logo-container').appendChild(renderer.domElement);

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
    document.getElementById('loading').style.display = 'none';
    
    // === 初始化导航栏 ===
    updateNavbar();
    
    // === 初始化导航栏 ===
    updateNavbar();
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
        document.getElementById('loading').textContent = '文件加载失败，请检查STL文件路径';
    });
}

// ============ 渲染循环函数 ============
// 每帧调用，处理动画更新和渲染
function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    
    // === 处理logo旋转动画效果 ===
    if (logo) {
        if (isRotating) {
            // 惯性旋转到目标位置（平滑过渡）
            const diffX = targetRotationX - currentRotationX;
            const diffY = targetRotationY - currentRotationY;
            const diffZ = targetRotationZ - currentRotationZ;
            
            // X轴旋转插值计算
            if (Math.abs(diffX) > 0.01) {
                currentRotationX += diffX * 0.1;
            } else {
                currentRotationX = targetRotationX;
            }
            
            // Y轴旋转插值计算
            if (Math.abs(diffY) > 0.01) {
                currentRotationY += diffY * 0.1;
            } else {
                currentRotationY = targetRotationY;
            }
            
            // Z轴旋转插值计算
            if (Math.abs(diffZ) > 0.01) {
                currentRotationZ += diffZ * 0.1;
            } else {
                currentRotationZ = targetRotationZ;
            }
            
            // 计算旋转进度并更新状态过渡
            const totalDiff = Math.abs(diffX) + Math.abs(diffY) + Math.abs(diffZ);
            stateProgress = Math.max(0, Math.min(1, 1 - totalDiff / Math.PI)); // 进度从0到1
            
            // 实时更新导航栏
            updateNavbar();
            
            // 检查是否完成旋转
            if (Math.abs(diffX) <= 0.01 && Math.abs(diffY) <= 0.01 && Math.abs(diffZ) <= 0.01) {
                isRotating = false;
                currentState = targetState; // 确保状态同步
                stateProgress = 1; // 确保进度完成
                updateNavbar(); // 最终更新
            }
        } else if (isHoveringLogo) {
            // 悬停引导效果：只有当鼠标悬停在logo上时才显示轻微摆动
            const hoverEffect = Math.sin(Date.now() * 0.002) * 0.003;
            currentRotationY += hoverEffect;
        }
        
        // 应用旋转到logo对象
        logo.rotation.x = currentRotationX;
        logo.rotation.y = currentRotationY;
        logo.rotation.z = currentRotationZ;
    }
    
    // 渲染场景
    renderer.render(scene, camera);
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
        const centerAreaSize = 0.35; // 70%区域的一半
        const isInCenterArea = (Math.abs(mouse.x) <= centerAreaSize && Math.abs(mouse.y) <= centerAreaSize);
        
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
        
        // 只有当鼠标悬停在logo上时才能进行交互
        if (isHoveringLogo && !isRotating) {
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
    let navbarElement = document.querySelector('.nav-content');
    
    // 如果导航栏不存在，创建它
    if (!navbarElement) {
        const navbar = document.getElementById('navbar');
        if (navbar) {
            navbarElement = navbar.querySelector('.nav-content');
        }
    }
    
    if (!navbarElement) {
        console.error('导航栏元素未找到');
        return;
    }
    
    // 状态名称数组
    const stateNames = ['', 'YINGXUN', 'PROJEKTE', 'KONTAKT'];

    if (isRotating && currentState !== targetState) {
        // 旋转中：根据进度混合显示两个状态的文字
        const fromState = currentState;
        const toState = targetState;
        
        if (stateProgress < 0.5) {
            // 前半段：显示当前状态，逐渐变透明
            navbarElement.textContent = stateNames[fromState];
            navbarElement.style.opacity = 1 - stateProgress * 2; // 从1到0
        } else {
            // 后半段：显示目标状态，逐渐显现
            navbarElement.textContent = stateNames[toState];
            navbarElement.style.opacity = (stateProgress - 0.5) * 2; // 从0到1
        }
    } else {
        // 静止状态：正常显示当前状态
        navbarElement.textContent = stateNames[currentState];
        navbarElement.style.opacity = 1;
    }
}

// ============ 事件监听器注册 ============
// 注册全局事件监听器
window.addEventListener('resize', onWindowResize); // 窗口大小改变事件
window.addEventListener('load', init); // 页面加载完成事件