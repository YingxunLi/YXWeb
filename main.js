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
        let bubbleText = '';
        let hasBubble = false;

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
            bubbleText = 'UI';
            hasBubble = true;
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
            bubbleText = 'UX';
            hasBubble = true;
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
            bubbleText = 'PM';
            hasBubble = true;
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
            bubbleText = 'Design';
            hasBubble = true;
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
            bubbleText = 'Content';
            hasBubble = true;
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
            bubbleText = 'Social';
            hasBubble = true;
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
            bubbleText = 'Visual';
            hasBubble = true;
        }

        // 只为有内容的项生成气泡
        if (hasBubble) {
            const bubbleSize = 40 + Math.random() * 20;
            const horizontalRand = (Math.random() - 0.5) * 60;
            const bubbleOffsetY = 12;
            const bubble = document.createElement('div');
            bubble.className = 'timeline-bubble bubble-below';
            bubble.textContent = bubbleText;
            bubble.style.width = bubble.style.height = `${bubbleSize}px`;
            bubble.style.lineHeight = `${bubbleSize}px`;
            bubble.style.opacity = '0';
            bubble.style.position = 'absolute';
            bubble.style.transform = 'scale(0.7)';
            let contentLines = contentElement ? contentElement.querySelectorAll('.content-line').length : 3;
            let contentHeight = contentLines * 18 + 8;
            let bubbleTop = item.top + contentHeight + bubbleOffsetY;
            bubble.style.top = `${bubbleTop}px`;
            if (contentElement && contentElement.classList.contains('left-content')) {
                bubble.style.right = `calc(50% + 100px + ${horizontalRand}px)`;
            } else if (contentElement && contentElement.classList.contains('right-content')) {
                bubble.style.left = `calc(50% + 100px + ${horizontalRand}px)`;
            }
            timelineContainer.appendChild(bubble);
        }
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
    
    const detailContent = utils.getElement('detail-content');
    if (detailContent) {
        detailContent.addEventListener('scroll', handlePageScroll, { passive: true });
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
        detailContent.scrollTop = 0;
    }
}

// ============ page scrollen ============
function handlePageScroll() {
    if (!isDetailMode || currentState !== 1 || !timelineContainer) return;
    
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

    const leftLine = timelineContainer.querySelector('.left-line');
    const rightLine = timelineContainer.querySelector('.right-line');
    const allLabels = timelineContainer.querySelectorAll('.timeline-label');
    const allPoints = timelineContainer.querySelectorAll('.timeline-point');
    const allContents = timelineContainer.querySelectorAll('.timeline-content');
    const allBubbles = timelineContainer.querySelectorAll('.timeline-bubble');
    
    if (!leftLine || !rightLine || allLabels.length === 0) return;
    
    const totalItems = allLabels.length;
    const visibleItemsFloat = timelineScrollProgress * totalItems;
    const visibleItems = Math.floor(visibleItemsFloat);
    const currentItemProgress = visibleItemsFloat - visibleItems;
    
    // 计算时间轴线的高度
    let maxVisibleHeight = 10; 
    
    // 更新每个时间轴项目的显示状态
    allLabels.forEach((label, index) => {
        const point = allPoints[index];
        const content = allContents[index]; // 可能为null
        const bubble = allBubbles[index];

        // 判断内容的第一行是否开始出现
        let firstLineVisible = false;
        if (content) {
            const firstLine = content.querySelector('.content-line[data-line="0"]');
            if (firstLine) {
                firstLineVisible = parseFloat(firstLine.style.opacity || '0') > 0;
            }
        }

        // 控制时间点显示：内容第一行开始出现时就显示
        if (point) {
            point.style.opacity = firstLineVisible ? '1' : '0';
        }
        
        if (index < visibleItems) {
            // 已完全显示的项目
            label.style.opacity = '1';
            if (point) point.style.opacity = '1';
            if (content) {
                content.style.opacity = '1';
                // 显示所有内容行
                const contentLines = content.querySelectorAll('.content-line');
                contentLines.forEach(line => {
                    line.style.opacity = '1';
                    line.style.transform = 'translateX(0)';
                });
            }
            if (bubble) {
                // 首次渐显时自动渐隐
                if (!bubble.__autoFade) {
                    bubble.style.opacity = '1';
                    bubble.style.transform = 'scale(1)';
                    bubble.__autoFade = true;
                    setTimeout(() => {
                        bubble.style.opacity = '0';
                        bubble.style.transform = 'scale(0.7)';
                        // 允许再次渐显（如重新滚动）
                        setTimeout(() => { bubble.__autoFade = false; }, 600);
                    }, 1200); // 1.2秒后开始渐隐
                }
            }
            
            // 更新最大高度
            const itemTop = parseFloat(label.style.top) || 0;
            maxVisibleHeight = Math.max(maxVisibleHeight, itemTop + 50);
        } else if (index === visibleItems) {
            // 正在显示的项目（渐进效果）
            const opacity = currentItemProgress.toString();
            label.style.opacity = opacity;
            if (point) point.style.opacity = opacity;
            if (content) {
                content.style.opacity = '1';
                // 特殊处理内容行的逐行显示
                const contentLines = content.querySelectorAll('.content-line');
                const totalLines = contentLines.length;
                const lineProgress = currentItemProgress * totalLines;
                
                // 判断内容是左侧还是右侧
                const isRightContent = content.classList.contains('right-content');
                
                contentLines.forEach((line, lineIndex) => {
                    if (lineIndex < Math.floor(lineProgress)) {
                        // 完全显示的行
                        line.style.opacity = '1';
                        line.style.transform = 'translateX(0)';
                    } else if (lineIndex === Math.floor(lineProgress)) {
                        // 正在显示的行
                        const currentLineProgress = lineProgress - lineIndex;
                        line.style.opacity = currentLineProgress.toString();
                        
                        // 根据左右侧设置不同的滑入方向
                        if (isRightContent) {
                            // 右侧内容：从左向右滑入
                            const translateX = (1 - currentLineProgress) * -50; // 负值表示从左侧滑入
                            line.style.transform = `translateX(${translateX}px)`;
                        } else {
                            // 左侧内容：从右向左滑入
                            const translateX = (1 - currentLineProgress) * 50; // 正值表示从右侧滑入
                            line.style.transform = `translateX(${translateX}px)`;
                        }
                    } else {
                        // 未显示的行
                        line.style.opacity = '0';
                        if (isRightContent) {
                            // 右侧内容：初始位置在左侧
                            line.style.transform = 'translateX(-50px)';
                        } else {
                            // 左侧内容：初始位置在右侧
                            line.style.transform = 'translateX(50px)';
                        }
                    }
                });
            }
            if (bubble) {
                bubble.style.opacity = currentItemProgress.toString();
                bubble.style.transform = `scale(${0.7 + 0.3 * currentItemProgress})`;
                // 只在完全渐显后自动渐隐
                if (!bubble.__autoFade && currentItemProgress > 0.99) {
                    bubble.__autoFade = true;
                    setTimeout(() => {
                        bubble.style.opacity = '0';
                        bubble.style.transform = 'scale(0.7)';
                        setTimeout(() => { bubble.__autoFade = false; }, 600);
                    }, 1200);
                }
            }
            // 更新最大高度
            const itemTop = parseFloat(label.style.top) || 0;
            maxVisibleHeight = Math.max(maxVisibleHeight, itemTop + 50); 
        } else {
            // 未显示的项目保持透明
            label.style.opacity = '0';
            if (point) point.style.opacity = '0';
            if (content) {
                content.style.opacity = '0';
                // 隐藏所有内容行
                const contentLines = content.querySelectorAll('.content-line');
                const isRightContent = content.classList.contains('right-content');
                
                contentLines.forEach(line => {
                    line.style.opacity = '0';
                    if (isRightContent) {
                        // 右侧内容：初始位置在左侧
                        line.style.transform = 'translateX(-50px)';
                    } else {
                        // 左侧内容：初始位置在右侧
                        line.style.transform = 'translateX(50px)';
                    }
                });
            }
            if (bubble) {
                bubble.style.opacity = '0';
                bubble.style.transform = 'scale(0.7)';
                bubble.__autoFade = false;
            }
        }
    });
    
    // 找到09.2018和03.2022的索引
    const idx2018 = Array.from(allLabels).findIndex(label => label.textContent === '09.2018');
    const idx2022 = Array.from(allLabels).findIndex(label => label.textContent === '03.2022');

    // 计算左侧进度条进度（与09.2018内容同步）
    let leftProgress = 0;
    if (visibleItems > idx2018) {
        leftProgress = 1;
    } else if (visibleItems === idx2018) {
        const content = timelineContainer.querySelector(`#timeline-content-${idx2018}`);
        if (content) {
            const lines = content.querySelectorAll('.content-line');
            let linesVisible = 0;
            lines.forEach(line => {
                const op = line.style.opacity;
                if (parseFloat(op || '0') >= 1) linesVisible++;
            });
            leftProgress = lines.length ? linesVisible / lines.length : currentItemProgress;
        } else {
            leftProgress = currentItemProgress;
        }
    } else {
        leftProgress = 0;
    }

    // 计算右侧进度条进度（与03.2022内容同步）
    let rightProgress = 0;
    if (visibleItems > idx2022) {
        rightProgress = 1;
    } else if (visibleItems === idx2022) {
        const content = timelineContainer.querySelector(`#timeline-content-${idx2022}`);
        if (content) {
            const lines = content.querySelectorAll('.content-line');
            let linesVisible = 0;
            lines.forEach(line => {
                const op = line.style.opacity;
                if (parseFloat(op || '0') >= 1) linesVisible++;
            });
            rightProgress = lines.length ? linesVisible / lines.length : currentItemProgress;
        } else {
            rightProgress = currentItemProgress;
        }
    } else {
        rightProgress = 0;
    }

    const idx072022 = Array.from(allLabels).findIndex(label => label.textContent === '07.2022');

    // 计算右侧进度条进度（与07.2022内容同步）
    let rightProgress072022 = 0;
    if (visibleItems > idx072022) {
        rightProgress072022 = 1;
    } else if (visibleItems === idx072022) {
        const content = timelineContainer.querySelector(`#timeline-content-${idx072022}`);
        if (content) {
            const lines = content.querySelectorAll('.content-line');
            let linesVisible = 0;
            lines.forEach(line => {
                const op = line.style.opacity;
                if (parseFloat(op || '0') >= 1) linesVisible++;
            });
            rightProgress072022 = lines.length ? linesVisible / lines.length : currentItemProgress;
        } else {
            rightProgress072022 = currentItemProgress;
        }
    } else {
        rightProgress072022 = 0;
    }

    // timeline anfang lange
    // const lineHeight = maxVisibleHeight;
    // const lineHeight = Math.max(maxVisibleHeight, 910);
    const lineHeight = 1210;
    leftLine.style.height = `${lineHeight}px`;
    rightLine.style.height = `${lineHeight}px`;

    // 左侧黑色进度条
    const progressBar = timelineContainer.querySelector('.timeline-progress-bar');
    if (progressBar) {
        const maxBarHeight = 300;
        const barHeight = Math.min(maxBarHeight, leftProgress * maxBarHeight);
        progressBar.style.height = `${barHeight}px`;
    }

    const leftProgressBar102024 = timelineContainer.querySelector('.timeline-progress-bar.left-bar.left-bar-102024');
    if (leftProgressBar102024) {
        const idx102024 = Array.from(allLabels).findIndex(label => label.textContent === '10.2024');
        let leftProgress102024 = 0;
        if (visibleItems > idx102024) {
            leftProgress102024 = 1;
        } else if (visibleItems === idx102024) {
            const content = timelineContainer.querySelector(`#timeline-content-${idx102024}`);
            if (content) {
                const lines = content.querySelectorAll('.content-line');
                let linesVisible = 0;
                lines.forEach(line => {
                    const op = line.style.opacity;
                    if (parseFloat(op || '0') >= 1) linesVisible++;
                });
                leftProgress102024 = lines.length ? linesVisible / lines.length : currentItemProgress;
            } else {
                leftProgress102024 = currentItemProgress;
            }
        } else {
            leftProgress102024 = 0;
        }
        const maxBarHeight = 480;
        const barHeight = Math.min(maxBarHeight, leftProgress102024 * maxBarHeight);
        leftProgressBar102024.style.height = `${barHeight}px`;
    }

    // 右侧黑色进度条
    const rightProgressBar = timelineContainer.querySelector('.timeline-progress-bar.right-bar');
    if (rightProgressBar) {
        const maxRightBarHeight = 150;
        const barHeight = Math.min(maxRightBarHeight, rightProgress * maxRightBarHeight);
        rightProgressBar.style.height = `${barHeight}px`;
    }

    // 新增：右侧黑色进度条（07.2022）
    const rightProgressBar072022 = timelineContainer.querySelector('.timeline-progress-bar.right-bar.right-bar-072022');
    if (rightProgressBar072022) {
        const maxBarHeight = 150;
        const barHeight = Math.min(maxBarHeight, rightProgress072022 * maxBarHeight);
        rightProgressBar072022.style.height = `${barHeight}px`;
    }

    // 新增：右侧黑色进度条（08.2024）
    const rightProgressBar082024 = timelineContainer.querySelector('.timeline-progress-bar.right-bar.right-bar-082024');
    if (rightProgressBar082024) {
        const idx082024 = Array.from(allLabels).findIndex(label => label.textContent === '08.2024');
        let rightProgress082024 = 0;
        if (visibleItems > idx082024) {
            rightProgress082024 = 1;
        } else if (visibleItems === idx082024) {
            const content = timelineContainer.querySelector(`#timeline-content-${idx082024}`);
            if (content) {
                const lines = content.querySelectorAll('.content-line');
                let linesVisible = 0;
                lines.forEach(line => {
                    const op = line.style.opacity;
                    if (parseFloat(op || '0') >= 1) linesVisible++;
                });
                rightProgress082024 = lines.length ? linesVisible / lines.length : currentItemProgress;
            } else {
                rightProgress082024 = currentItemProgress;
            }
        } else {
            rightProgress082024 = 0;
        }

        const maxBarHeight = 200;
        const barHeight = Math.min(maxBarHeight, rightProgress082024 * maxBarHeight);
        rightProgressBar082024.style.height = `${barHeight}px`;
    }

    // 新增：右侧黑色进度条（12.2024）
    const rightProgressBar122024 = timelineContainer.querySelector('.timeline-progress-bar.right-bar.right-bar-122024');
    if (rightProgressBar122024) {
        const idx122024 = Array.from(allLabels).findIndex(label => label.textContent === '12.2024');
        let rightProgress122024 = 0;
        if (visibleItems > idx122024) {
            rightProgress122024 = 1;
        } else if (visibleItems === idx122024) {
            const content = timelineContainer.querySelector(`#timeline-content-${idx122024}`);
            if (content) {
                const lines = content.querySelectorAll('.content-line');
                let linesVisible = 0;
                lines.forEach(line => {
                    const op = line.style.opacity;
                    if (parseFloat(op || '0') >= 1) linesVisible++;
                });
                rightProgress122024 = lines.length ? linesVisible / lines.length : currentItemProgress;
            } else {
                rightProgress122024 = currentItemProgress;
            }
        } else {
            rightProgress122024 = 0;
        }

        const maxBarHeight = 400;
        const barHeight = Math.min(maxBarHeight, rightProgress122024 * maxBarHeight);
        rightProgressBar122024.style.height = `${barHeight}px`;
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
        
        // nur wenn über dem Logo, nicht in der Detailansicht und nicht während einer Rotation
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
            item.style.transition = '';
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
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
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