// ============ base ============

//cursor
function getCursorSvg(text) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '14px Arial';
    const textWidth = ctx.measureText(text).width;
    const padding = 32;
    const minWidth = 80;
    const width = Math.max(minWidth, Math.ceil(textWidth + padding));
    const height = 30;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <rect width="${width}" height="${height}" fill="black" rx="15"/>
        <text x="${width/2}" y="20" text-anchor="middle" fill="white" font-family="Arial" font-size="12">${text}</text>
    </svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

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

const utils = {
    domCache: {},
    getElement(id) {
        if (!this.domCache[id]) {
            this.domCache[id] = document.getElementById(id);
        }
        return this.domCache[id];
    },
    
    smoothTransition(current, target, factor = ANIMATION_CONSTANTS.INTERPOLATION_FACTOR) {
        const diff = target - current;
        if (Math.abs(diff) > ANIMATION_CONSTANTS.ROTATION_THRESHOLD) {
            return current + diff * factor;
        }
        return target;
    },
    
    isAnimationComplete(diffs, threshold = ANIMATION_CONSTANTS.ROTATION_THRESHOLD) {
        return diffs.every(diff => Math.abs(diff) <= threshold);
    },
    
    calculateTotalDiff(...diffs) {
        return diffs.reduce((sum, diff) => sum + Math.abs(diff), 0);
    }
};

// Three.js logo
let scene, camera, renderer, controls;
let logo; 

let isHovering = false; // canvas hover - label
let isHoveringLogo = false; // logo hover - drehen
let mouseX = 0;
let lastMouseX = 0; 

let targetRotationX = 0;
let targetRotationY = 0;
let targetRotationZ = 0;
let currentRotationX = 0;
let currentRotationY = 0;
let currentRotationZ = 0;

let isRotating = false; 
let interactionCount = 0; 
let hasTriggered = false;
let currentState = 1; 
let targetState = 1; 
let stateProgress = 1; 

// subpage detail mode
let isDetailMode = false; 
let isTransitioningToDetail = false; 
let logoTargetScale = 1; 
let logoCurrentScale = 1;
let logoTargetPosition = { x: 0, y: 0, z: 0 }; 
let logoCurrentPosition = { x: 0, y: 0, z: 0 }; 

// timeline
let timelineScrollProgress = 0; 
let timelineContainer = null;
let timelineMaxHeight = 1000;
let hasScrollControl = false;
let skillAnimationPhase = 0; // 0: start, 1: rings, 2: balls falling, 3: lid closing, 4: ready for person anim, 5: person anim done

// mouse - raycaster
let raycaster = new THREE.Raycaster(); 
let mouse = new THREE.Vector2(); 

// scene,camera,renderer,controls init
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff); // 白色背景

    // camera
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

    // renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false; // keine Schatten
    utils.getElement('logo-container').appendChild(renderer.domElement);

    // controls,selbst kontrollieren
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.25;
    controls.screenSpacePanning = false;

    addMouseEvents();

    loadSTL();

    animate();

    utils.getElement('loading').style.display = 'none';
    
    // menu
    updateNavbar();
    // menu klick events
    addNavbarEvents();
}

// ============ logo loading ============
function loadSTL() {
    const loader = new THREE.STLLoader();
    
    loader.load('logo.stl', function (geometry) {
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        const center = box.getCenter(new THREE.Vector3());
        
        geometry.translate(-center.x, -center.y, -center.z);

        const material = new THREE.MeshBasicMaterial({ 
            color: 0x000000, 
            side: THREE.DoubleSide
        });

        logo = new THREE.Mesh(geometry, material);
        scene.add(logo);

        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = maxDim * 4.5; // logo groß anpassen, abstand vergrößern
        
        camera.left = frustumSize * aspect / -2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = frustumSize / -2;
        camera.updateProjectionMatrix();

        camera.position.set(0, 0, 50);
        camera.lookAt(0, 0, 0);
        
        controls.target.set(0, 0, 0);
        controls.update();

    }, function (progress) {
        console.log('speed: ' + (progress.loaded / progress.total * 100) + '%');
    }, function (error) {
        console.error('fail:', error);
        utils.getElement('loading').textContent = 'Failed to load logo model.';
    });
}

// ============ logo animation ============
function animate() {
    requestAnimationFrame(animate);
    
    if (!isDetailMode && !isTransitioningToDetail) {
        controls.update();
    }    
    if (logo) {
        if (isTransitioningToDetail || isDetailMode) {
            // Groß/Klein und Position Animations
            const scaleDiff = logoTargetScale - logoCurrentScale;
            logoCurrentScale = utils.smoothTransition(logoCurrentScale, logoTargetScale, ANIMATION_CONSTANTS.INTERPOLATION_FACTOR);
            
            const positionDiffs = [
                logoTargetPosition.x - logoCurrentPosition.x,
                logoTargetPosition.y - logoCurrentPosition.y,
                logoTargetPosition.z - logoCurrentPosition.z
            ];
            
            logoCurrentPosition.x = utils.smoothTransition(logoCurrentPosition.x, logoTargetPosition.x, ANIMATION_CONSTANTS.INTERPOLATION_FACTOR);
            logoCurrentPosition.y = utils.smoothTransition(logoCurrentPosition.y, logoTargetPosition.y, ANIMATION_CONSTANTS.INTERPOLATION_FACTOR);
            logoCurrentPosition.z = utils.smoothTransition(logoCurrentPosition.z, logoTargetPosition.z, ANIMATION_CONSTANTS.INTERPOLATION_FACTOR);
            
            logo.scale.set(logoCurrentScale, logoCurrentScale, logoCurrentScale);
            logo.position.set(logoCurrentPosition.x, logoCurrentPosition.y, logoCurrentPosition.z);
            
            // fur Test: Position ausdrucken
            // if (Math.floor(Date.now() / 500) % 2 === 0) {
            //     console.log('Logo position:', logoCurrentPosition, 'Scale:', logoCurrentScale);
            // }
            
            // check
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
        } else if (isHoveringLogo && isDetailMode) {
            // 详情页模式下的hover效果：轻微放大提示可点击
            logoCurrentScale = logoTargetScale * 1.1; // 放大10%作为hover提示
        } else if (isDetailMode) {
            // 详情页模式下非hover状态：恢复正常大小
            // logoCurrentScale会在下面的插值中自动恢复到logoTargetScale
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

// ============ logo-->subpage detail ============
function enterDetailMode() {
    if (isDetailMode || isTransitioningToDetail) return;
    
    console.log('Entering detail mode...');
    isTransitioningToDetail = true;
    isDetailMode = true;
    
    // OrbitControls verboten
    controls.enabled = false;
    
    // bewegungsbereich berechnen 
    const cameraWidth = camera.right - camera.left;
    const moveDistance = cameraWidth * ANIMATION_CONSTANTS.CAMERA_MOVE_FACTOR; 
    
    // Ziel
    logoTargetScale = ANIMATION_CONSTANTS.LOGO_DETAIL_SCALE; // scale
    logoTargetPosition.x = -moveDistance * 1.2; // position
    
    const navbar = utils.getElement('navbar');
    if (navbar) {
        // menu position
        const navbarRect = navbar.getBoundingClientRect();
        const navbarCenterY = navbarRect.top + navbarRect.height / 2; 
        
        const vector = new THREE.Vector3();

        vector.x = 0;
        vector.y = -(navbarCenterY / window.innerHeight) * 2 + 1;
        vector.z = 0;

        vector.unproject(camera);
        
        const manualOffset = 0; 
        logoTargetPosition.y = vector.y + manualOffset;
        
        console.log('Navbar screen position:', navbarCenterY);
        console.log('Screen height:', window.innerHeight);
        console.log('NDC Y coordinate:', -(navbarCenterY / window.innerHeight) * 2 + 1);
        console.log('Unprojected world Y:', vector.y);
        console.log('Camera top/bottom:', camera.top, camera.bottom);
    } else {
        const cameraHeight = camera.top - camera.bottom;
        const navbarRelativePosition = (80 / window.innerHeight - 0.5) * -1;
        logoTargetPosition.y = navbarRelativePosition * cameraHeight;
        console.log('Using fallback calculation');
    }
    
    logoTargetPosition.z = 0;
    
    console.log('Camera width:', cameraWidth);
    console.log('Target position set to:', logoTargetPosition);
    console.log('Current position:', logoCurrentPosition);
    
    console.log('Current state when entering detail mode:', currentState);
    // subpage wechseln
    if (currentState === 1) {
        createTimeline();
    } else if (currentState === 2) {
        setTimeout(() => showProjectsGrid(), 100);
    } else if (currentState === 3) {
        setTimeout(() => showKontaktContent(), 100);
    }
    
    updateNavbar();
}

// ============ subpage detail--> logo============
function exitDetailMode() {
    if (!isDetailMode) return;
    
    console.log('Exiting detail mode...');
    isTransitioningToDetail = true;
    isDetailMode = false;
    
    controls.enabled = true;
    
    logoTargetScale = 1;
    logoTargetPosition.x = 0;
    logoTargetPosition.y = 0;
    logoTargetPosition.z = 0;
    
    removeTimeline();
    
    updateNavbar();
}

// ============ ⚠️timeline ============
function createTimeline() {
    console.log('createTimeline() called, isDetailMode:', isDetailMode, 'currentState:', currentState);
    
    if (timelineContainer) {
        removeTimeline();
    }
    
    // container
    let detailContent = utils.getElement('detail-content');
    if (!detailContent) {
        detailContent = document.createElement('div');
        detailContent.id = 'detail-content';
        detailContent.className = 'visible';
        document.body.appendChild(detailContent);
    } else {
        detailContent.className = 'visible';
    }
    
    timelineContainer = document.createElement('div');
    timelineContainer.id = 'timeline-container';
    
    // 为时间轴容器增加最小高度，以在底部创建留白
    // 您可以调整 3500px 这个值来控制留白的高度
    timelineContainer.style.minHeight = '3500px';

    // line
    const leftLine = document.createElement('div');
    leftLine.className = 'timeline-line left-line';
    timelineContainer.appendChild(leftLine);

    const rightLine = document.createElement('div');
    rightLine.className = 'timeline-line right-line';
    timelineContainer.appendChild(rightLine);

    const rawTimelineData = [
        { time: '09.2018', side: 'left', title: 'Ausbildung' },
        { time: '03.2022', side: 'right', title: 'Berufserfahrung' },
        { time: '06.2022', side: 'left' },
        { time: '05.2022', side: 'right' },
        { time: '07.2022', side: 'right' },
        { time: '09.2022', side: 'right' },
        { time: '08.2024', side: 'right' },
        { time: '10.2024', side: 'left' },
        { time: '11.2024', side: 'right' },
        { time: '12.2024', side: 'right' },
        { time: '06.2025', side: 'right' },
        { time: '03.2028', side: 'left' }
    ];

    const centerY = window.innerHeight * 0.3 + 30;
    // time point position
    const originalTops = [0, 110, 300, 260, 340, 490, 570, 730, 770, 810, 960, 1210];
    const timelineData = rawTimelineData.map((item, idx) => ({
        ...item,
        top: centerY + (originalTops[idx] - originalTops[0])
    }));

    // black progress bar
    const idx2018 = rawTimelineData.findIndex(item => item.time === '09.2018');
    const top2018 = timelineData[idx2018].top;

    const idx2022 = rawTimelineData.findIndex(item => item.time === '03.2022');
    const top2022 = timelineData[idx2022].top;

    const idx072022 = rawTimelineData.findIndex(item => item.time === '07.2022');
    const top072022 = timelineData[idx072022].top;

    const idx082024 = rawTimelineData.findIndex(item => item.time === '08.2024');
    const top082024 = timelineData[idx082024].top;

    const idx122024 = rawTimelineData.findIndex(item => item.time === '12.2024');
    const top122024 = timelineData[idx122024].top;

    const idx102024 = rawTimelineData.findIndex(item => item.time === '10.2024');
    const top102024 = timelineData[idx102024].top;

    const progressBar = document.createElement('div');
    progressBar.className = 'timeline-progress-bar';
    progressBar.style.top = `${top2018}px`;
    progressBar.style.height = '0px';
    progressBar.id = 'timeline-progress-bar';
    timelineContainer.appendChild(progressBar);

    const progressBar102024 = document.createElement('div');
    progressBar102024.className = 'timeline-progress-bar left-bar left-bar-102024';
    progressBar102024.style.top = `${top102024}px`;
    progressBar102024.style.height = '0px';
    progressBar102024.id = 'timeline-progress-bar-102024';
    timelineContainer.appendChild(progressBar102024);

    const rightProgressBar = document.createElement('div');
    rightProgressBar.className = 'timeline-progress-bar right-bar';
    rightProgressBar.style.top = `${top2022}px`;
    rightProgressBar.style.height = '0px';
    rightProgressBar.id = 'timeline-progress-bar-right';
    timelineContainer.appendChild(rightProgressBar);

    const rightProgressBar072022 = document.createElement('div');
    rightProgressBar072022.className = 'timeline-progress-bar right-bar right-bar-072022';
    rightProgressBar072022.style.top = `${top072022}px`;
    rightProgressBar072022.style.height = '0px';
    rightProgressBar072022.id = 'timeline-progress-bar-right-072022';
    timelineContainer.appendChild(rightProgressBar072022);

    const rightProgressBar082024 = document.createElement('div');
    rightProgressBar082024.className = 'timeline-progress-bar right-bar right-bar-082024';
    rightProgressBar082024.style.top = `${top082024}px`;
    rightProgressBar082024.style.height = '0px';
    rightProgressBar082024.id = 'timeline-progress-bar-right-082024';
    timelineContainer.appendChild(rightProgressBar082024);

    const rightProgressBar122024 = document.createElement('div');
    rightProgressBar122024.className = 'timeline-progress-bar right-bar right-bar-122024';
    rightProgressBar122024.style.top = `${top122024}px`;
    rightProgressBar122024.style.height = '0px';
    rightProgressBar122024.id = 'timeline-progress-bar-right-122024';
    timelineContainer.appendChild(rightProgressBar122024);

    
    setTimeout(() => {
        const rightLineElem = timelineContainer.querySelector('.right-line');
        if (rightLineElem) {
            const rightLineCenter = rightLineElem.offsetLeft + rightLineElem.offsetWidth / 2;
            const progressBarWidth = rightProgressBar.offsetWidth || 4;
            rightProgressBar.style.left = `${rightLineCenter - progressBarWidth / 2}px`;
        }
    }, 0);

    setTimeout(() => {
        const rightLineElem = timelineContainer.querySelector('.right-line');
        if (rightLineElem) {
            const rightLineCenter = rightLineElem.offsetLeft + rightLineElem.offsetWidth / 2;
            const progressBarWidth = rightProgressBar072022.offsetWidth || 4;
            rightProgressBar072022.style.left = `${rightLineCenter - progressBarWidth / 2}px`;
        }
    }, 0);

    setTimeout(() => {
        const rightLineElem = timelineContainer.querySelector('.right-line');
        if (rightLineElem) {
            const rightLineCenter = rightLineElem.offsetLeft + rightLineElem.offsetWidth / 2;
            const progressBarWidth = rightProgressBar082024.offsetWidth || 4;
            rightProgressBar082024.style.left = `${rightLineCenter - progressBarWidth / 2}px`;
        }
    }, 0);

    setTimeout(() => {
        const rightLineElem = timelineContainer.querySelector('.right-line');
        if (rightLineElem) {
            const rightLineCenter = rightLineElem.offsetLeft + rightLineElem.offsetWidth / 2;
            const progressBarWidth = rightProgressBar122024.offsetWidth || 4;
            rightProgressBar122024.style.left = `${rightLineCenter - progressBarWidth / 2}px`;
        }
    }, 0);


    const leftTitle = document.createElement('div');
    leftTitle.className = 'timeline-title left-title';
    leftTitle.textContent = 'Ausbildung';
    timelineContainer.appendChild(leftTitle);
    
    const rightTitle = document.createElement('div');
    rightTitle.className = 'timeline-title right-title';
    rightTitle.textContent = 'Berufserfahrung';
    timelineContainer.appendChild(rightTitle);
    
    timelineData.forEach((item, index) => {
        const labelElement = document.createElement('div');
        labelElement.className = 'timeline-label';
        labelElement.textContent = item.time;
        labelElement.style.top = `${item.top}px`;
        labelElement.style.opacity = '0';
        labelElement.id = `timeline-label-${index}`;
        timelineContainer.appendChild(labelElement);
        
        // point
        const pointElement = document.createElement('div');
        pointElement.className = `timeline-point ${item.side}-point`;
        pointElement.style.top = `${item.top}px`;
        pointElement.style.opacity = '0';
        pointElement.id = `timeline-point-${index}`;
        timelineContainer.appendChild(pointElement);
        
        let contentElement = null;
        
        // 左侧内容
        if (item.time === '09.2018') {
            contentElement = document.createElement('div');
            contentElement.className = 'timeline-content left-content';
            contentElement.style.top = `${item.top}px`;
            contentElement.style.opacity = '0';
            contentElement.id = `timeline-content-${index}`;
            contentElement.innerHTML = `
                <div class="content-line content-title" data-line="0">Zhejiang University of Technology</div>
                <div class="content-line content-location" data-line="1">Hangzhou, Zhejiang, China</div>
                <div class="content-line content-degree" data-line="2">Industrie Design, Bachelor of Engineering</div>
            `;
            timelineContainer.appendChild(contentElement);
        }
        if (item.time === '10.2024') {
            contentElement = document.createElement('div');
            contentElement.className = 'timeline-content left-content';
            contentElement.style.top = `${item.top}px`;
            contentElement.style.opacity = '0';
            contentElement.id = `timeline-content-${index}`;
            contentElement.innerHTML = `
                <div class="content-line content-title" data-line="0">Hochschule für Gestaltung Schwäbisch Gmünd</div>
                <div class="content-line content-location" data-line="1">Schwäbisch Gmünd, Baden-Württemberg, Deutschland</div>
                <div class="content-line content-degree" data-line="2">Interaktiongestaltung, Bachelor of Arts</div>
            `;
            timelineContainer.appendChild(contentElement);
        }
        // 右侧内容
        if (item.time === '03.2022') {
            contentElement = document.createElement('div');
            contentElement.className = 'timeline-content right-content';
            contentElement.style.top = `${item.top}px`;
            contentElement.style.opacity = '0';
            contentElement.id = `timeline-content-${index}`;
            contentElement.innerHTML = `
                <div class="content-line content-title" data-line="0">Produktmanager Praktikant</div>
                <div class="content-line content-location" data-line="1">Hangzhou Zhixiao Technology Co. ｜ Hangzhou, Zhejiang, China ｜ Vor Ort</div>
                <div class="content-line content-description" data-line="2">Erstellung von PRD sowie Web- und Mobil-Prototypen eines Jobsuchprodukts für Studierende</div>
            `;
            timelineContainer.appendChild(contentElement);
        }
        if (item.time === '07.2022') {
            contentElement = document.createElement('div');
            contentElement.className = 'timeline-content right-content';
            contentElement.style.top = `${item.top}px`;
            contentElement.style.opacity = '0';
            contentElement.id = `timeline-content-${index}`;
            contentElement.innerHTML = `
                <div class="content-line content-title" data-line="0">Produktmanager</div>
                <div class="content-line content-location" data-line="1">Chaozhou Three-circle Group Co., Ltd. ｜ Chaozhou, Guangdong, China ｜ Vor Ort</div>
                <div class="content-line content-description" data-line="2">Erstellung von Designspezifikationen für CNC-Bearbeitung smarter Produkte</div>
            `;
            timelineContainer.appendChild(contentElement);
        }
        if (item.time === '08.2024') {
            contentElement = document.createElement('div');
            contentElement.className = 'timeline-content right-content';
            contentElement.style.top = `${item.top}px`;
            contentElement.style.opacity = '0';
            contentElement.id = `timeline-content-${index}`;
            contentElement.innerHTML = `
                <div class="content-line content-title" data-line="0">Content Marketing Praktikant</div>
                <div class="content-line content-location" data-line="1">Education Victory ｜ Portland, Oregon, Vereinigte Staaten von Amerika ｜ Remote</div>
                <div class="content-line content-description" data-line="2">Betrieb des YouTube-Kanals inkl. Video-Editing und Datenanalyse</div>
                <div class="content-line content-description" data-line="3">Entwurf interaktiver 3D-Prototypen für Systemdesign-Strukturen</div>
                <div class="content-line content-description" data-line="4">Marktforschung zu Jobsuche-Tools und Entwicklung kreativer Ideen</div>
            `;
            timelineContainer.appendChild(contentElement);
        }
        if (item.time === '12.2024') {
            contentElement = document.createElement('div');
            contentElement.className = 'timeline-content right-content';
            contentElement.style.top = `${item.top}px`;
            contentElement.style.opacity = '0';
            contentElement.id = `timeline-content-${index}`;
            contentElement.innerHTML = `
                <div class="content-line content-title" data-line="0">Freiwilliger für Content-Management</div>
                <div class="content-line content-location" data-line="1">Weltladen Schwäbisch Gmünd｜Schwäbisch Gmünd, Baden-Württemberg, Deutschland｜Vor Ort</div>
                <div class="content-line content-description" data-line="2">Promotion auf Instagram: Videoaufnahme, Fotografie, Nachbearbeitung</div>
            `;
            timelineContainer.appendChild(contentElement);
        }
        if (item.time === '06.2025') {
            contentElement = document.createElement('div');
            contentElement.className = 'timeline-content right-content';
            contentElement.style.top = `${item.top}px`;
            contentElement.style.opacity = '0';
            contentElement.id = `timeline-content-${index}`;
            contentElement.innerHTML = `
                <div class="content-line content-title" data-line="0">Kommunikationsdesigner (Studentische Hiwi)</div>
                <div class="content-line content-location" data-line="1">open science for open societies｜Ludwigsburg, Baden-Württemberg｜Deutschland · Remote</div>
                <div class="content-line content-description" data-line="2">Mitarbeit am Parkli-Boje-Projekt: Gestaltung von Visual-Postern, Unterstützung bei der Erstellung von Leitfäden</div>
                <div class="content-line content-description" data-line="3">Mitarbeit am FEAST-Projekt: Gestaltung von Postern, Flyern, interaktiven Materialien für die FEAST Summer School 2025</div>
            `;
            timelineContainer.appendChild(contentElement);
        }
    });

    // 技能区域
    const skillsContainer = document.createElement('div');
    skillsContainer.id = 'skills-container';
    const skillsData = [
        { title: 'UI', percentage: 80, content: 'Illustrator<br>Photoshop<br>Indesign<br>Premiere' },
        { title: 'UX', percentage: 80, content: 'Figma<br>HTML, CSS, JavaScript<br>Arduino' },
        { title: '3D', percentage: 70, content: 'Rhino<br>Blender<br>Keyshot' },
        { title: 'Sprache', percentage: 75, content: 'Chinesisch (Muttersprache)<br>Deutsch (TestDaF C1)<br>Englisch' }
    ];

    const radius = 54;
    const circumference = 2 * Math.PI * radius;

    skillsData.forEach(skill => {
        const offset = circumference - (skill.percentage / 100) * circumference;
        const skillItem = document.createElement('div');
        skillItem.className = 'skill-item';
        skillItem.innerHTML = `
            <div class="skill-ring-container">
                <svg class="skill-ring" width="120" height="120" viewBox="0 0 120 120">
                    <circle class="skill-ring-bg" cx="60" cy="60" r="${radius}"></circle>
                    <circle class="skill-ring-fg" cx="60" cy="60" r="${radius}" stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"></circle>
                </svg>
                <div class="skill-title">${skill.title}</div>
            </div>
            <div class="skill-content">${skill.content}</div>
        `;
        skillsContainer.appendChild(skillItem);
    });
    timelineContainer.appendChild(skillsContainer);

    // 技能碗、盖子和小球
    const skillCircleWrapper = document.createElement('div');
    skillCircleWrapper.id = 'skill-circle-wrapper';
    
    const skillBowlContainer = document.createElement('div');
    skillBowlContainer.id = 'skill-bowl-container';
    skillBowlContainer.innerHTML = '<div id="skill-bowl"></div>';

    const skillBowlLid = document.createElement('div');
    skillBowlLid.id = 'skill-bowl-lid';

    skillCircleWrapper.appendChild(skillBowlLid);
    skillCircleWrapper.appendChild(skillBowlContainer);

    // 添加人形身体元素
    const personBody = document.createElement('div');
    personBody.id = 'person-body';
    skillCircleWrapper.appendChild(personBody);

    // 添加文字元素
    const textElement = document.createElement('div');
    textElement.id = 'manchmal-text';
    textElement.textContent = 'Manchmal will ich';
    textElement.style.opacity = '0';
    skillCircleWrapper.appendChild(textElement);

    // 添加到时间线容器
    timelineContainer.appendChild(skillCircleWrapper);

    skillsData.forEach((skill, index) => {
        const ball = document.createElement('div');
        ball.className = `skill-ball skill-ball-${index + 1}`;
        ball.textContent = skill.title;
        // 将小球也放入 wrapper，便于定位
        skillCircleWrapper.appendChild(ball);
    });
    
    detailContent.appendChild(timelineContainer);
    
    timelineScrollProgress = 0;
    updateTimelineDisplay();
    
    addTimelineScrollEvents();
}

// ============ timeline weg ============
function removeTimeline() {
    if (timelineContainer) {
        if (timelineContainer.parentNode) {
            timelineContainer.parentNode.removeChild(timelineContainer);
        }
        timelineContainer = null;
    }
    
    clearDetailContent();
    
    removeTimelineScrollEvents();
}

// ============ timeline scrollen ============
function addTimelineScrollEvents() {
    if (hasScrollControl) return;
    
    hasScrollControl = true;
    skillAnimationPhase = 0; // 重置动画阶段
    
    const detailContent = utils.getElement('detail-content');
    if (detailContent) {
        // 需要移除 passive: true 以便使用 preventDefault()
        detailContent.addEventListener('scroll', handlePageScroll);
        detailContent.addEventListener('wheel', handlePageScroll, { passive: false });
    }
    
    const body = document.getElementById('page-body');
    if (body) {
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        body.style.paddingRight = `${scrollbarWidth}px`;
        body.classList.add('no-scroll');
    }

    if (detailContent) {
        detailContent.scrollTop = 0;
    }
    timelineScrollProgress = 0;
}

function removeTimelineScrollEvents() {
    if (!hasScrollControl) return;
    
    hasScrollControl = false;
    
    const detailContent = utils.getElement('detail-content');
    if (detailContent) {
        detailContent.removeEventListener('scroll', handlePageScroll);
        detailContent.removeEventListener('wheel', handlePageScroll);
        detailContent.scrollTop = 0;
    }

    const body = document.getElementById('page-body');
    if (body) {
        body.style.paddingRight = '';
        body.classList.remove('no-scroll');
    }
}

// ============ page scrollen ============
function handlePageScroll(event) {
    if (!isDetailMode || currentState !== 1 || !timelineContainer) return;

    // 阶段3：盖子动画，阻止滚动
    if (skillAnimationPhase === 3 && event.deltaY > 0) {
        event.preventDefault();
        const lid = document.getElementById('skill-bowl-lid');
        if (lid && !lid.classList.contains('closing')) {
            console.log("Closing lid");
            lid.classList.add('closing');
            
            lid.addEventListener('animationend', () => {
                console.log("Lid animation finished.");
                skillAnimationPhase = 4; // 动画完成，准备人形动画
            }, { once: true });
        }
        return;
    }

    // 阶段4：人形动画，阻止滚动
    if (skillAnimationPhase === 4 && event.deltaY > 0) {
        event.preventDefault();
        const circleWrapper = document.getElementById('skill-circle-wrapper');
        if (circleWrapper && !circleWrapper.classList.contains('shrink-to-head')) {
            console.log("Starting person animation");
            circleWrapper.classList.add('shrink-to-head');
            circleWrapper.classList.add('show-person');
            
            // 动画完成后更新状态
            // 监听身体动画结束，因为它和头部动画时长相同
            const personBody = document.getElementById('person-body');
            personBody.addEventListener('animationend', (e) => {
                if (e.animationName === 'transform-to-body') {
                    console.log("Person animation finished");
                    skillAnimationPhase = 5; // 人形动画完成
                    // 恢复滚动 - 移除
                }
// ...existing code...
            }, { once: true });
        }
        return;
    }
    
    // 阶段 5: 恢复为圆形，并显示初始文字
    if (skillAnimationPhase === 5 && event.deltaY > 0) {
        event.preventDefault();
        const circleWrapper = document.getElementById('skill-circle-wrapper');
        const textElement = document.getElementById('manchmal-text');

        if (circleWrapper && !circleWrapper.classList.contains('restore-circle')) {
            console.log("Phase 5: Restoring to circle with initial text.");
            
            // 1. 确保文字内容是初始状态
            textElement.innerHTML = 'Manchmal will ich';
            textElement.style.opacity = '1';
            
            // 2. 添加恢复动画
            circleWrapper.classList.add('restore-circle');

            // 3. 监听恢复动画结束，然后进入下一阶段
            circleWrapper.addEventListener('animationend', (e) => {
                if (e.animationName === 'restore-to-circle') {
                    console.log("Restore animation finished. Ready for phase 6.");
                    skillAnimationPhase = 6;
                }
            }, { once: true });
        }
        return;
    }

    // 阶段 6: 旋转并补全文字
    if (skillAnimationPhase === 6 && event.deltaY > 0) {
        event.preventDefault();
        const circleWrapper = document.getElementById('skill-circle-wrapper');
        const textElement = document.getElementById('manchmal-text');

        if (circleWrapper && !circleWrapper.classList.contains('flip-circle')) {
            console.log("Phase 6: Rotating and revealing full text.");

            // 1. 补全文字内容
            textElement.innerHTML = 'Manchmal will ich<br><span class="new-text-part">die Welt auf</span><br><span class="new-text-part">den Kopf stellen</span>';
            
            // 2. 开始旋转动画
            circleWrapper.classList.add('flip-circle');

            // 3. 延迟让新文本淡入
            setTimeout(() => {
                const newTextParts = textElement.querySelectorAll('.new-text-part');
                newTextParts.forEach(part => part.style.opacity = '1');
            }, 200);

            // 4. 监听旋转动画结束，然后进入下一阶段
            textElement.addEventListener('animationend', (e) => {
                if (e.animationName === 'text-rotate-animation') {
                    console.log("Text rotation finished. Ready for phase 7.");
                    skillAnimationPhase = 7;
                }
            }, { once: true });
        }
        return;
    }

    // 阶段 7: 隐藏文字并播放第二次人形动画
    if (skillAnimationPhase === 7 && event.deltaY > 0) {
        event.preventDefault();
        const circleWrapper = document.getElementById('skill-circle-wrapper');
        const textElement = document.getElementById('manchmal-text');
        const personBody = document.getElementById('person-body');

        if (circleWrapper && !circleWrapper.classList.contains('text-hidden')) {
            console.log("Phase 7: Hiding text and showing second person animation.");

            // 1. 隐藏文字
            textElement.style.opacity = '0';
            circleWrapper.classList.add('text-hidden');

            // 2. 短暂延迟后，开始第二次人形动画
            setTimeout(() => {
                circleWrapper.classList.remove('restore-circle', 'flip-circle');
                personBody.style.opacity = '1';
                circleWrapper.classList.add('shrink-to-head', 'show-person');

                // 3. 监听第二次人形动画结束，然后进入下一阶段
                personBody.addEventListener('animationend', (e) => {
                    if (e.animationName === 'transform-to-body') {
                        console.log("Second person animation finished. Ready for phase 8.");
                        skillAnimationPhase = 8;
                    }
                }, { once: true });
            }, 500);
        }
        return;
    }
    // 阶段8: 第二次人形动画后，恢复为带有"Manchmal will ich"文本的大圆形状态
    if (skillAnimationPhase === 8 && event.deltaY > 0) {
        event.preventDefault();
        const circleWrapper = document.getElementById('skill-circle-wrapper');
        const textElement = document.getElementById('manchmal-text');
        const personBody = document.getElementById('person-body');
        
        if (circleWrapper) {
            console.log("Restoring to circle with initial text");
            
            // 移除所有人形相关的类
            circleWrapper.classList.remove('shrink-to-head', 'show-person', 'text-hidden');
            
            // 重置文本并准备显示
            textElement.innerHTML = 'Manchmal will ich';
            
            // 添加恢复动画
            circleWrapper.classList.add('restore-circle');
            
            // 监听恢复动画结束
            circleWrapper.addEventListener('animationend', (e) => {
                if (e.animationName === 'restore-to-circle') {
                    console.log("Restore animation finished, showing initial text");
                    // 显示文本
                    textElement.style.opacity = '1';
                    skillAnimationPhase = 9; // 进入阶段9，准备复制圆形
                }
            }, { once: true });
        }
        return;
    }
    
    // 阶段9: 利用已有的两个重叠圆实现分离
    if (skillAnimationPhase === 9 && event.deltaY > 0) {
        event.preventDefault();
        const circleWrapper = document.getElementById('skill-circle-wrapper');
        const personBody = document.getElementById('person-body');
        
        if (circleWrapper && personBody && !circleWrapper.classList.contains('duplicated')) {
            console.log("Separating existing circles, no new elements created.");

            // 1. 将 #person-body 从 #skill-circle-wrapper 中移出，成为同级元素
            const parentContainer = circleWrapper.parentNode;
            if (personBody.parentNode === circleWrapper) {
                parentContainer.appendChild(personBody);
            }

            // 2. 为 #person-body 添加 .second-circle 类，以便独立设置样式
            personBody.classList.add('second-circle');
            
            // 4. 添加移动动画类
            circleWrapper.classList.add('duplicated', 'move-left');
            personBody.classList.add('move-right');

            // 5. 确保原始圆内的文字可见
            const originalText = document.getElementById('manchmal-text');
            if (originalText) {
                originalText.style.opacity = '1';
            }
            // 6. 动画结束，进入最终阶段
            skillAnimationPhase = 10;
        }
        return;
    }

    // 阶段 10: 生成眼睛
    if (skillAnimationPhase === 10 && event.deltaY > 0) {
        event.preventDefault();
        const textElement = document.getElementById('manchmal-text');
        const timelineContainer = document.getElementById('timeline-container');

        if (textElement && timelineContainer && !document.getElementById('left-eye')) {
            console.log("Phase 10: Hiding text and showing eyes.");

            // 1. 隐藏文字
            textElement.style.opacity = '0';

            // 2. 创建并添加眼睛元素
            const leftEye = document.createElement('div');
            leftEye.id = 'left-eye';
            leftEye.className = 'eye-oval';
            timelineContainer.appendChild(leftEye);

            const rightEye = document.createElement('div');
            rightEye.id = 'right-eye';
            rightEye.className = 'eye-oval';
            timelineContainer.appendChild(rightEye);

            // 3. 触发出现动画
            setTimeout(() => {
                leftEye.classList.add('appearing');
                rightEye.classList.add('appearing');
            }, 50); // 短暂延迟以确保CSS transition生效

            // 4. 进入下一阶段
            skillAnimationPhase = 11;
        }
        return;
    }

    // 阶段 11: 在眼睛中显示文字
    if (skillAnimationPhase === 11 && event.deltaY > 0) {
        event.preventDefault();
        const timelineContainer = document.getElementById('timeline-container');

        if (timelineContainer && !document.getElementById('left-eye-text')) {
            console.log("Phase 11: Showing text in eyes.");

            // 1. 创建左侧文字
            const leftText = document.createElement('div');
            leftText.id = 'left-eye-text';
            leftText.className = 'eye-text left-text';
            leftText.innerHTML = 'manchmal<br>will<br>ich';
            timelineContainer.appendChild(leftText);

            // 2. 创建右侧文字
            const rightText = document.createElement('div');
            rightText.id = 'right-eye-text';
            rightText.className = 'eye-text right-text';
            rightText.innerHTML = 'einfach<br>mit<br>ihr<br>quatschen';
            timelineContainer.appendChild(rightText);

            // 3. 触发动画
            setTimeout(() => {
                leftText.classList.add('visible');
                rightText.classList.add('visible');
            }, 50);

            // 4. 进入最终阶段
            skillAnimationPhase = 12;
        }
        return;
    }

    // 新增阶段12：动画结束状态，阻止后续滚动触发任何操作
    if (skillAnimationPhase === 12 && event.deltaY > 0) {
        event.preventDefault();
        return;
    }
    
    // 如果动画阶段在2之前，则允许正常的时间轴滚动
// ...existing code...
    
    const detailContent = utils.getElement('detail-content');
    if (!detailContent) return;
    
    const scrollTop = detailContent.scrollTop;
    const containerHeight = timelineContainer.offsetHeight;
    const viewportHeight = detailContent.clientHeight;
    
    const scrollableHeight = containerHeight - viewportHeight;
    let newProgress = 0;
    
    if (scrollableHeight > 0) {
        newProgress = Math.min(scrollTop / scrollableHeight, 1);
    }
    
    if (newProgress > timelineScrollProgress) {
        timelineScrollProgress = newProgress;
    }
    updateTimelineDisplay();
}

function updateTimelineDisplay() {
    if (!timelineContainer) return;

    const detailContent = utils.getElement('detail-content');
    if (!detailContent) return;

    const leftLine = timelineContainer.querySelector('.left-line');
    const rightLine = timelineContainer.querySelector('.right-line');
    const allLabels = timelineContainer.querySelectorAll('.timeline-label');
    const allPoints = timelineContainer.querySelectorAll('.timeline-point');

    if (!leftLine || !rightLine || allLabels.length === 0) return;

    const viewportHeight = detailContent.clientHeight;
    const triggerPoint = viewportHeight * 0.5; // 动画在屏幕中线触发

    // 辅助函数：计算与内容显示同步的进度
    const calculateContentProgress = (itemIndex, itemProgress) => {
        const content = document.getElementById(`timeline-content-${itemIndex}`);
        if (!content) return itemProgress;

        const lines = content.querySelectorAll('.content-line');
        if (lines.length === 0) return itemProgress;

        const lineProgress = itemProgress * lines.length;
        let visibleLines = 0;
        lines.forEach((line, lineIndex) => {
            if (lineProgress > lineIndex + 1) {
                visibleLines++;
            } else if (lineProgress > lineIndex) {
                visibleLines += lineProgress - lineIndex;
            }
        });
        return visibleLines / lines.length;
    };

    // 更新每个时间轴项目的显示状态
    allLabels.forEach((label, index) => {
        const point = allPoints[index];
        const content = document.getElementById(`timeline-content-${index}`);

        const itemRect = label.getBoundingClientRect();
        const detailContentRect = detailContent.getBoundingClientRect();
        const itemTopInViewport = itemRect.top - detailContentRect.top;

        // 计算当前项的进度 (0到1)
        const animationStart = triggerPoint;
        const animationEnd = triggerPoint - 150; // 150px的滚动距离内完成动画
        const itemProgress = Math.max(0, Math.min(1, (animationStart - itemTopInViewport) / (animationStart - animationEnd)));

        // 1. Label 和 Point 的显示逻辑
        const showLabelAndPoint = itemProgress > 0;
        label.style.opacity = showLabelAndPoint ? '1' : '0';
        if (point) point.style.opacity = showLabelAndPoint ? '1' : '0';

        // 2. Content 的显示逻辑
        if (content) {
            content.style.opacity = showLabelAndPoint ? '1' : '0';
            const contentLines = content.querySelectorAll('.content-line');
            const totalLines = contentLines.length;
            const lineProgress = itemProgress * totalLines;
            const isRightContent = content.classList.contains('right-content');

            contentLines.forEach((line, lineIndex) => {
                const currentLineProgress = Math.max(0, Math.min(1, lineProgress - lineIndex));
                line.style.opacity = currentLineProgress.toString();
                
                const slideDistance = 50;
                const translateX = (1 - currentLineProgress) * (isRightContent ? -slideDistance : slideDistance);
                line.style.transform = `translateX(${translateX}px)`;
            });
        }
    });
    
    // 4. Black Line (进度条) 的显示逻辑
    const lineHeight = 1210;
    leftLine.style.height = `${lineHeight}px`;
    rightLine.style.height = `${lineHeight}px`;

    const updateProgressBar = (selector, time, maxHeight) => {
        const progressBar = timelineContainer.querySelector(selector);
        const labelIndex = Array.from(allLabels).findIndex(label => label.textContent === time);
        if (progressBar && labelIndex !== -1) {
            const label = allLabels[labelIndex];
            const itemRect = label.getBoundingClientRect();
            const detailContentRect = detailContent.getBoundingClientRect();
            const itemTopInViewport = itemRect.top - detailContentRect.top;
            const animationStart = triggerPoint;
            const animationEnd = triggerPoint - 150;
            const itemProgress = Math.max(0, Math.min(1, (animationStart - itemTopInViewport) / (animationStart - animationEnd)));
            
            const progress = calculateContentProgress(labelIndex, itemProgress);
            progressBar.style.height = `${progress * maxHeight}px`;
        }
    };

    updateProgressBar('#timeline-progress-bar', '09.2018', 300);
    updateProgressBar('#timeline-progress-bar-102024', '10.2024', 480);
    updateProgressBar('#timeline-progress-bar-right', '03.2022', 150);
    updateProgressBar('#timeline-progress-bar-right-072022', '07.2022', 150);
    updateProgressBar('#timeline-progress-bar-right-082024', '08.2024', 200);
    updateProgressBar('#timeline-progress-bar-right-122024', '12.2024', 400);

    // 5. 技能区域的显示逻辑
    const skillsContainer = document.getElementById('skills-container');
    if (skillsContainer) {
        const skillsRect = skillsContainer.getBoundingClientRect();
        const detailContentRect = detailContent.getBoundingClientRect();
        const skillsTopInViewport = skillsRect.top - detailContentRect.top;

        if (skillsTopInViewport < viewportHeight * 0.8) {
            if (skillAnimationPhase < 1) {
                skillAnimationPhase = 1;
                skillsContainer.style.opacity = '1';
                
                const skillRings = skillsContainer.querySelectorAll('.skill-ring-fg');
                const skillsData = [
                    { percentage: 80 }, { percentage: 80 }, { percentage: 70 }, { percentage: 75 }
                ];
                const radius = 54;
                const circumference = 2 * Math.PI * radius;

                skillRings.forEach((ring, index) => {
                    const offset = circumference - (skillsData[index].percentage / 100) * circumference;
                    ring.style.strokeDashoffset = offset;
                });
            }
        }
    }

    // 6. 技能碗和小球动画
    const circleWrapper = document.getElementById('skill-circle-wrapper');
    if (circleWrapper) {
        const wrapperRect = circleWrapper.getBoundingClientRect();
        const detailContentRect = detailContent.getBoundingClientRect();
        const wrapperTopInViewport = wrapperRect.top - detailContentRect.top;

        if (wrapperTopInViewport < viewportHeight * 0.7 && skillAnimationPhase < 2) {
            skillAnimationPhase = 2;
            circleWrapper.style.opacity = '1';

            const skillItems = document.querySelectorAll('.skill-item');
            const balls = document.querySelectorAll('.skill-ball');

            balls.forEach((ball, index) => {
                const skillItemRect = skillItems[index].querySelector('.skill-ring-container').getBoundingClientRect();
                const wrapperRect = circleWrapper.getBoundingClientRect();
                
                // 计算小球相对于 wrapper 的初始位置
                const initialX = skillItemRect.left - wrapperRect.left + (skillItemRect.width / 2) - (ball.offsetWidth / 2);
                const initialY = skillItemRect.top - wrapperRect.top + (skillItemRect.height / 2) - (ball.offsetHeight / 2);

                ball.style.left = `${initialX}px`;
                ball.style.top = `${initialY}px`;
                
                ball.classList.add(`fall-${index + 1}`);
            });

            // 监听最后一个球的动画结束
            const lastBall = balls[balls.length - 1];
            lastBall.addEventListener('animationend', () => {
                console.log("Ball animation finished. Ready for lid.");
                skillAnimationPhase = 3; // 球已落下，准备盖盖子
                // 不再需要在这里隐藏滚动条
            }, { once: true });
        }
    }
}

// ============ 🧭 mouse events interaction logik ============
function addMouseEvents() {
    const canvas = renderer.domElement;
    
    canvas.addEventListener('mouseenter', () => {
        isHovering = true; 
    });
    
    canvas.addEventListener('mouseleave', () => {
        isHovering = false; 
    });
    
    canvas.addEventListener('mousemove', (event) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        const isInCenterArea = (Math.abs(mouse.x) <= ANIMATION_CONSTANTS.CENTER_AREA_SIZE && Math.abs(mouse.y) <= ANIMATION_CONSTANTS.CENTER_AREA_SIZE);
        
        // drehen (cursor)
        if (logo) {
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(logo);
            isHoveringLogo = intersects.length > 0;
            
            if (isDetailMode && isHoveringLogo) {
                canvas.style.cursor = 'pointer'; 
            } else {
                canvas.style.cursor = 'default'; 
            }
        }
        
        // menu opacity
        const navbar = document.getElementById('navbar');
        if (navbar) {
            navbar.style.opacity = isInCenterArea ? '1' : '0';
        }
        
        // interaction detection
        const currentMouseX = (event.clientX / window.innerWidth) * 2 - 1;
        
        // nur wenn über dem Logo, nicht in der Detailansicht und nicht während的一次旋转
        if (isHoveringLogo && !isRotating && !isDetailMode && !isTransitioningToDetail) {
            const deltaX = currentMouseX - lastMouseX;
            
            // nur linke Bewegung erkennen
            if (deltaX < -0.02 && !hasTriggered) {
                console.log(deltaX); 
                
                hasTriggered = true;
                isRotating = true;
                interactionCount++;

                // rotate direction and target state
                if (interactionCount === 1) {
                    targetRotationY += Math.PI / 2;
                    targetState = 2;
                } else if (interactionCount === 2) {
                    targetRotationX -= Math.PI / 2;
                    targetRotationY += Math.PI / 4;
                    targetState = 3; 
                } else if (interactionCount === 3) {
                    targetRotationX = 0;
                    targetRotationY = 0;
                    targetRotationZ = 0;
                    targetState = 1; 
                } else {
                    const cyclePosition = (interactionCount - 1) % 3 + 1; 
                    
                    if (cyclePosition === 1) {
                        targetRotationX = 0;
                        targetRotationY = Math.PI / 2;
                        targetRotationZ = 0;
                        targetState = 2; // Projekte
                    } else if (cyclePosition === 2) {
                        targetRotationX = -Math.PI / 2;
                        targetRotationY = Math.PI / 2 + Math.PI / 4;
                        targetRotationZ = 0;
                        targetState = 3; // Kontakt
                    } else if (cyclePosition === 3) {
                        targetRotationX = 0;
                        targetRotationY = 0;
                        targetRotationZ = 0;
                        targetState = 1; // Yingxun
                    }
                }
                
                // delay
                setTimeout(() => {
                    hasTriggered = false;
                }, 500);
                
            } else if (deltaX > 0.02) {
                console.log(deltaX);
            }
        }
        
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

// ============ navigation bar click event ============
function addNavbarEvents() {
    const navItems = {
        yingxun: document.getElementById('nav-yingxun'),
        projekte: document.getElementById('nav-projekte'),
        kontakt: document.getElementById('nav-kontakt')
    };
    
    if (navItems.yingxun) {
        navItems.yingxun.addEventListener('click', () => {
            console.log('Clicked nav-yingxun, isDetailMode:', isDetailMode, 'isRotating:', isRotating);
            if (!isRotating) {
                if (!isDetailMode) {
                    enterDetailMode();
                }
                switchToState(1); // Yingxun
            }
        });
    }
    
    if (navItems.projekte) {
        navItems.projekte.addEventListener('click', () => {
            console.log('Clicked nav-projekte, isDetailMode:', isDetailMode, 'isRotating:', isRotating);
            if (!isRotating) {
                if (!isDetailMode) {
                    enterDetailMode();
                }
                switchToState(2); // Projekte
            }
        });
    }
    
    if (navItems.kontakt) {
        navItems.kontakt.addEventListener('click', () => {
            console.log('Clicked nav-kontakt, isDetailMode:', isDetailMode, 'isRotating:', isRotating);
            if (!isRotating) {
                if (!isDetailMode) {
                    enterDetailMode();
                }
                switchToState(3); // Kontakt
            }
        });
    }
}

// ============ subpage wechseln ============
function switchToState(newState) {
    if (currentState === newState || isRotating) return;
    
    console.log(`Switching from state ${currentState} to state ${newState}`);
    
    targetState = newState;
    isRotating = true;
    
    if (newState === 1) {
        // Yingxun
        targetRotationX = 0;
        targetRotationY = 0;
        targetRotationZ = 0;
        removeTimeline(); 
        setTimeout(() => {
            console.log('Creating timeline after switching to yingxun state');
            createTimeline();
        }, 500); // nach der Rotation Zeit geben
    } else if (newState === 2) {
        // Projekte
        targetRotationX = 0;
        targetRotationY = Math.PI / 2;
        targetRotationZ = 0;
        removeTimeline();
        setTimeout(() => showProjectsGrid(), 500);
    } else if (newState === 3) {
        // Kontakt
        targetRotationX = -Math.PI / 2;
        targetRotationY = Math.PI / 2 + Math.PI / 4;
        targetRotationZ = 0;
        removeTimeline();
        setTimeout(() => showKontaktContent(), 500);
    }
    
    console.log('Target rotation set to:', {
        x: targetRotationX,
        y: targetRotationY,
        z: targetRotationZ
    });
    
    updateNavbar();
}

// ============ Projekt ============
function showProjectsGrid() {
    let detailContent = utils.getElement('detail-content');
    if (!detailContent) {
        detailContent = document.createElement('div');
        detailContent.id = 'detail-content';
        detailContent.className = 'visible';
        document.body.appendChild(detailContent);
    } else {
        detailContent.className = 'visible';
    }

    detailContent.innerHTML = '';

    const projectsData = [
    { id: 'project-1', image: 'projects/project-1/images/cover.png', titlePath: 'projects/project-1/title.txt' },
    { id: 'project-2', image: 'projects/project-2/images/cover.png', titlePath: 'projects/project-2/title.txt' },
    { id: 'project-3', image: 'projects/project-3/images/cover.png', titlePath: 'projects/project-3/title.txt' },
    { id: 'project-4', image: 'projects/project-4/images/cover.png', titlePath: 'projects/project-4/title.txt' },
    { id: 'project-5', image: 'projects/project-5/images/cover.png', titlePath: 'projects/project-5/title.txt' },
    { id: 'project-6', image: 'projects/project-6/images/cover.png', titlePath: 'projects/project-6/title.txt' }
    ];

    const preloadAll = projectsData.map(project => {
        return Promise.all([
            fetch(project.titlePath).then(r => r.text()).catch(() => project.id),
            new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = project.image;
            })
        ]).then(([title]) => {
            return { ...project, title: title.trim() };
        });
    });

    Promise.all(preloadAll).then(projectsWithTitle => {
        const projectsGrid = document.createElement('div');
        projectsGrid.id = 'projects-grid';
        projectsWithTitle.forEach(project => {
            const projectItem = document.createElement('div');
            projectItem.className = 'project-item';
            projectItem.setAttribute('data-project', project.title);
            const img = document.createElement('img');
            img.src = project.image;
            img.alt = project.title;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.filter = 'grayscale(100%)';
            img.style.transition = 'filter 0.2s ease, transform 0.2s ease';
            img.style.willChange = 'filter, transform';
            img.onerror = function() {
                this.style.display = 'none';
                this.parentElement.innerHTML = `<div class='project-fallback'>${project.title}</div>`;
            };
            const projectImageDiv = document.createElement('div');
            projectImageDiv.className = 'project-image';
            projectImageDiv.appendChild(img);
            const projectInfoDiv = document.createElement('div');
            projectInfoDiv.className = 'project-info';
            projectInfoDiv.innerHTML = `
                <h3 class="project-title">${project.title}</h3>
            `;
            projectItem.appendChild(projectImageDiv);
            projectItem.appendChild(projectInfoDiv);
            const projectTitle = project.title;
            function getCursorSvg(title) {
                const ctx = document.createElement('canvas').getContext('2d');
                ctx.font = '12px Arial';
                const textWidth = ctx.measureText(title).width;
                const padding = 32; // abstand links und rechts
                const minWidth = 80;
                const width = Math.max(minWidth, Math.ceil(textWidth + padding));
                const height = 30;
                const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="black" rx="15"/><text x="${width/2}" y="20" text-anchor="middle" fill="white" font-family="Arial" font-size="12">${title}</text></svg>`;
                return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
            }
            projectItem.addEventListener('mouseenter', function() {
                img.style.filter = 'grayscale(0%)';
                img.style.transform = 'scale(1.02)';
                this.style.cursor = `url('${getCursorSvg(projectTitle)}'), pointer`;
            });
            projectItem.addEventListener('mouseleave', function() {
                img.style.filter = 'grayscale(100%)';
                img.style.transform = 'scale(1)';
                this.style.cursor = 'pointer';
            });
            projectItem.addEventListener('click', function() {
                fetch(project.titlePath)
                .then(r => r.text())
                .then(title => {
                    showProjectDetail({ ...project, title: title.trim() });
                })
                .catch(() => {
                    showProjectDetail({ ...project, title: project.id });
                });
        });
            projectsGrid.appendChild(projectItem);
        });
        detailContent.appendChild(projectsGrid);
    });
}

// ============ bildschirm anpassen ============
function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    const frustumSize = 100; 
    
    camera.left = frustumSize * aspect / -2;
    camera.right = frustumSize * aspect / 2;
    camera.top = frustumSize / 2;
    camera.bottom = frustumSize / -2;
    camera.updateProjectionMatrix();
    
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============ navbar aktualisieren ============
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
        navbar.classList.add('detail-mode');
        
        navItems.yingxun.classList.remove('active');
        navItems.projekte.classList.remove('active');
        navItems.kontakt.classList.remove('active');
        
        if (currentState === 1) {
            navItems.yingxun.classList.add('active');
        } else if (currentState === 2) {
            navItems.projekte.classList.add('active');
        } else if (currentState === 3) {
            navItems.kontakt.classList.add('active');
        }
        
    } else {
        navbar.classList.remove('detail-mode');
                const stateNames = ['', 'YINGXUN', 'PROJEKTE', 'KONTAKT'];

        if (isRotating && currentState !== targetState) {
            const fromState = currentState;
            const toState = targetState;
            
            if (stateProgress < 0.5) {
                singleText.textContent = stateNames[fromState];
                singleText.style.opacity = 1 - stateProgress * 2; 
            } else {
                singleText.textContent = stateNames[toState];
                singleText.style.opacity = (stateProgress - 0.5) * 2;
            }
        } else {
            singleText.textContent = stateNames[currentState];
            singleText.style.opacity = 1;
        }
    }
}

// ============ projekt detail page ============
function showProjectDetail(project) {
    const clickedItem = document.querySelector(`[data-project="${project.title}"]`);
    const coverImg = clickedItem.querySelector('.project-image img');
    const rect = coverImg.getBoundingClientRect();

    animateOtherProjects(clickedItem, 'compress');

    const detailOverlay = document.createElement('div');
    detailOverlay.id = 'project-detail-overlay';
    detailOverlay.className = 'project-detail-expanding';
    detailOverlay.style.left = rect.left + 'px';
    detailOverlay.style.top = rect.top + 'px';
    detailOverlay.style.width = rect.width + 'px';
    detailOverlay.style.height = rect.height + 'px';
    detailOverlay.style.position = 'fixed';
    detailOverlay.style.zIndex = '1000';
    detailOverlay.style.overflow = 'hidden';
    detailOverlay.style.background = 'white';
    detailOverlay.innerHTML = `
        <div class="project-detail-content">
            <div class="project-hero-image">
                                ${
                                    project.id === 'project-1' ? `<iframe src="https://www.youtube.com/embed/oI59ZiLBVEc" title="YouTube video player" allowfullscreen style="border:0;"></iframe>` :
                                    project.id === 'project-2' ? `<iframe src="https://www.youtube.com/embed/OFShII4HHCA" title="YouTube video player" allowfullscreen style="border:0;"></iframe>` :
                                    project.id === 'project-4' ? `<iframe src="https://www.youtube.com/embed/kM82E3flrgI" title="YouTube video player" allowfullscreen style="border:0;"></iframe>` :
                                    project.id === 'project-6' ? `<iframe src="https://www.youtube.com/embed/XRp4K4O8NwU" title="YouTube video player" allowfullscreen style="border:0;"></iframe>` :
                                    `<img src="${project.image}" alt="${project.title}">`
                                }
            </div>
            <div class="project-detail-body" style="opacity:0;">
                <div class="project-header">
                    <h1 class="project-title">${project.title}</h1>
                </div>
                <div class="project-description loading">Loading…</div>
            </div>
        </div>
    `;
    document.body.appendChild(detailOverlay);

    fetch(`projects/${project.id}/detail.html`)
        .then(r => r.ok ? r.text() : Promise.reject())
        .then(html => {
            const desc = detailOverlay.querySelector('.project-description');
            if (desc) desc.innerHTML = html;
        })
        .catch(() => {
            const desc = detailOverlay.querySelector('.project-description');
            if (desc) desc.innerHTML = '<div class="error">详情内容未找到</div>';
        });

    // arrows and close button
    const currentIndex = getCurrentProjectIndex(project);
    const navArrows = document.createElement('div');
    navArrows.id = 'project-nav-arrows';
    navArrows.innerHTML = `
        <div class="nav-arrow nav-prev ${currentIndex === 0 ? 'disabled' : ''}" data-direction="prev">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="nav-arrow nav-next ${currentIndex === 5 ? 'disabled' : ''}" data-direction="next">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
    `;
    document.body.appendChild(navArrows);

    const closeBtn = document.createElement('div');
    closeBtn.className = 'project-close-btn';
    closeBtn.innerHTML = `<svg width="24" height="24"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2"/></svg>`;
    document.body.appendChild(closeBtn);

    setBackgroundTransparency(true);

    // animation to expanded
    setTimeout(() => {
        detailOverlay.classList.remove('project-detail-expanding');
        detailOverlay.classList.add('project-detail-expanded');
        detailOverlay.style.left = '';
        detailOverlay.style.top = '';
        detailOverlay.style.width = '';
        detailOverlay.style.height = '';
        detailOverlay.style.position = '';
        detailOverlay.style.overflow = '';
        const body = detailOverlay.querySelector('.project-detail-body');
        if (body) setTimeout(() => { body.style.opacity = '1'; }, 400);
        setAusprobierenBubble(body, project.id);
    }, 40);

    // animation to close
    closeBtn.onclick = () => {
        detailOverlay.classList.remove('project-detail-expanded');
        detailOverlay.classList.add('project-detail_expanding');
        detailOverlay.style.left = rect.left + 'px';
        detailOverlay.style.top = rect.top + 'px';
        detailOverlay.style.width = rect.width + 'px';
        detailOverlay.style.height = rect.height + 'px';
        detailOverlay.style.position = 'fixed';
        detailOverlay.style.overflow = 'hidden';
        detailOverlay.style.background = 'white';
        detailOverlay.querySelector('.project-detail-body').style.opacity = '0';
        navArrows.style.opacity = '0';
        closeBtn.style.opacity = '0';
        setTimeout(() => {
            detailOverlay.remove();
            navArrows.remove();
            closeBtn.remove();
            setBackgroundTransparency(false);
            animateOtherProjects(clickedItem, 'reset');
        }, 500);
    };

    // wechseln zwischen projekten
    navArrows.onclick = (e) => {
        const arrow = e.target.closest('.nav-arrow');
        if (!arrow || arrow.classList.contains('disabled')) return;
        const dir = arrow.dataset.direction;
        const ids = ['project-1','project-2','project-3','project-4','project-5','project-6'];
        let idx = currentIndex + (dir === 'next' ? 1 : -1);
        if (idx < 0 || idx >= ids.length) return;
        fetch('projects/' + ids[idx] + '/title.txt').then(r => r.text()).then(title => {
            fetch('projects/' + ids[idx]).then(r => r.text()).then(() => {
                detailOverlay.remove();
                navArrows.remove();
                closeBtn.remove();
                setBackgroundTransparency(false);
                animateOtherProjects(clickedItem, 'reset');
                setTimeout(() => {
                    showProjectDetail({
                        id: ids[idx],
                        image: 'projects/' + ids[idx] + '/images/cover.png',
                        title: title.trim(),
                    });
                }, 50);
            });
        });
    };
}

function getCurrentProjectIndex(project) {
    const ids = ['project-1','project-2','project-3','project-4','project-5','project-6'];
    return ids.findIndex(id => id === project.id);
}

function setBackgroundTransparency(isTransparent) {
       const elementsToHide = [
        '#container canvas',
        '#logo-container', 
        '#timeline-container',
        '#detail-content:not(#project-detail-overlay)'
    ];
    
    elementsToHide.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
            if (element) {
                element.style.opacity = isTransparent ? '0' : '';
                element.style.transition = '';
                element.style.pointerEvents = isTransparent ? 'none' : '';
            }
        });
    });
    
    const projectItems = document.querySelectorAll('.project-item');
    projectItems.forEach(item => {
        if (item) {
            if (isTransparent) {
                item.style.opacity = '0';
                item.style.pointerEvents = 'none';
            } else {
                item.style.opacity = '';
                item.style.pointerEvents = '';
                               item.style.transform = '';
            }
 }
    });
}

function animateOtherProjects(clickedItem, action) {
    const allItems = document.querySelectorAll('.project-item');
    const clickedIndex = clickedItem ? Array.from(allItems).indexOf(clickedItem) : -1;
    
    allItems.forEach((item, index) => {
        if (item === clickedItem) return;
        
        if (action === 'compress') {
            if (index < clickedIndex) {
                item.style.transform = 'translateX(-100px) scale(0.8)';
                item.style.opacity = '0.3';
            } else {
                item.style.transform = 'translateX(100px) scale(0.8)';
                item.style.opacity = '0.3';
            }
            item.style.pointerEvents = 'none';
        } else {
            item.style.transform = '';
            item.style.opacity = '';
            item.style.pointerEvents = '';
        }
        item.style.transition = ''; 
    });
}

function showProjectDetailDirect(project) {
    const currentIndex = getCurrentProjectIndex(project);
    
    const detailOverlay = document.createElement('div');
    detailOverlay.id = 'project-detail-overlay';
    detailOverlay.className = 'project-detail-expanded';
    
    const isMobile = window.innerWidth <= 768;
    const sideMargin = isMobile ? 60 : 120;
    const totalMargin = isMobile ? 120 : 240;
    
    detailOverlay.style.cssText = `
        position: fixed;
        left: ${sideMargin}px;
        top: 0;
        width: calc(100vw - ${totalMargin}px);
        height: 100vh;
        background: white;
        z-index: 1000;
        overflow-y: auto;
        scrollbar-width: none;
        -ms-overflow-style: none;
        opacity: 0;
        transform: scale(0.95);
        /* transition 由CSS统一管理 */
    `;
    
    detailOverlay.innerHTML = `
        <div class="project-detail-content">
            <div class="project-hero-image">
                <img src="${project.image}" alt="${project.title}">
            </div>
            <div class="project-detail-body">
                <div class="project-header">
                    <h1 class="project-title">${project.title}</h1>
                </div>
                <div class="project-description loading">Loading…</div>
            </div>
        </div>
    `;    

    document.body.appendChild(detailOverlay);

    fetch(`projects/${project.id}/detail.html`)
        .then(response => {
            if (!response.ok) throw new Error('Not found');
            return response.text();
        })
        .then(html => {
            const desc = detailOverlay.querySelector('.project-description');
            if(desc) desc.innerHTML = html;
        })
        .catch(() => {
            const desc = detailOverlay.querySelector('.project-description');
            if(desc) desc.innerHTML = '<div class="error">详情内容未找到</div>';
        });
    
    const backgroundOverlay = document.createElement('div');
    backgroundOverlay.id = 'project-detail-background';
    backgroundOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
                      height: 100vh;
        z-index: 999;
        pointer-events: auto;
        background: transparent;
    `;
    document.body.appendChild(backgroundOverlay);
    
    const navArrows = document.createElement('div');
    navArrows.id = 'project-nav-arrows';
    navArrows.style.opacity = '0';
    navArrows.innerHTML = `
        <div class="nav-arrow nav-prev ${currentIndex === 0 ? 'disabled' : ''}" data-direction="prev">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M15 18L9 12L15 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="nav-arrow nav-next ${currentIndex === 5 ? 'disabled' : ''}" data-direction="next">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M9 18L15 12L9 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
    `;
    document.body.appendChild(navArrows);

    const closeBtn = document.createElement('div');
    closeBtn.className = 'project-close-btn';
    closeBtn.style.opacity = '0';
    closeBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24" fill="none>
                       <path d="M18 6L6 18M6  6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;
    document.body.appendChild(closeBtn);
    
    setTimeout(() => {
        detailOverlay.style.opacity = '1';
        detailOverlay.style.transform = 'scale(1)';
        navArrows.style.opacity = '1';
        closeBtn.style.opacity = '1';
        const body = detailOverlay.querySelector('.project-detail-body');
        setAusprobierenBubble(body, project.id);
    }, 50);
    
    addProjectDetailEventListeners(detailOverlay, navArrows, closeBtn, currentIndex);
}

function setAusprobierenBubble(body, projectId) {
    const detailOverlay = document.getElementById('project-detail-overlay');
    if (!detailOverlay) return;
    if (!['project-1', 'project-2', 'project-4'].includes(projectId)) return;
    const ausprobierenLinks = {
        'project-1': 'https://yingxunli.github.io/foodcost2.0/',
        'project-2': 'https://yingxunli.github.io/WatchFaces_UX/3.Zeitfluss/index.html',
        'project-4': 'https://www.figma.com/proto/9YRQgwGVi8L8EWbic5hDy3/KisWake?node-id=105-176&p=f&t=Axgfse2ybSu2dRB9-1&scaling=scale-down&content-scaling=fixed&page-id=0%3A1'
    };

    function showBubble(e) {
        detailOverlay.style.cursor = `url('${getCursorSvg('ausprobieren')}'), pointer`;
    }

    function hideBubble() {
        detailOverlay.style.cursor = '';

    }

    detailOverlay.addEventListener('mouseenter', showBubble);
    detailOverlay.addEventListener('mouseleave', hideBubble);
    detailOverlay.addEventListener('click', function() {
        window.open(ausprobierenLinks[projectId], '_blank');
    });
}

function setProjectDetailOverlayLayout(detailOverlay) {
    const isMobile = window.innerWidth <= 768;
    const sideMargin = isMobile ? 60 : 200;
    detailOverlay.style.left = sideMargin + 'px';
    detailOverlay.style.right = sideMargin + 'px';
    detailOverlay.style.top = '0';
    detailOverlay.style.height = '100vh';

    detailOverlay.style.position = 'fixed';
    detailOverlay.style.background = 'white';
    detailOverlay.style.zIndex = '1000';
    detailOverlay.style.overflowY = 'auto';
    detailOverlay.style.scrollbarWidth = 'none';
    detailOverlay.style.msOverflowStyle = 'none';
}

function clearDetailContent() {
    const detailContent = utils.getElement('detail-content');
    if (detailContent) {
        const resizeHandlers = ['handleProjectsResize', 'handleKontaktResize'];
        resizeHandlers.forEach(handler => {
            if (window[handler]) {
                window.removeEventListener('resize', window[handler]);
                delete window[handler];
            }
        });
        
        detailContent.innerHTML = '';
        detailContent.className = '';
    }
}

window.addEventListener('resize', onWindowResize);
window.addEventListener('load', init);