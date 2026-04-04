// capsul-in-pro EXACT ANIMATION CLONE (GSAP)
document.addEventListener("DOMContentLoaded", () => {
    
    gsap.registerPlugin(ScrollTrigger);

    // 1. Preloader out animation
    const preloader = document.getElementById('preloader');
    if(preloader) {
        // Changed from window.onload to DOMContentLoaded with zero delay for immediate render
        gsap.to(preloader, {
            opacity: 0,
            duration: 0.3,
            ease: "power2.inOut",
            delay: 0,
            onComplete: () => {
                preloader.style.display = 'none';
                initGSAP();
            }
        });
    } else {
        initGSAP();
    }

    function initGSAP() {
        // --- HAMBURGER MENU TOGGLE ---
        const hamburger = document.getElementById('navHamburger');
        const mobileOverlay = document.getElementById('navMobileOverlay');
        if (hamburger && mobileOverlay) {
            hamburger.addEventListener('click', function() {
                const isOpen = this.classList.toggle('active');
                mobileOverlay.classList.toggle('open', isOpen);
                this.setAttribute('aria-expanded', isOpen);
                this.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
                document.body.style.overflow = isOpen ? 'hidden' : '';
            });
            // Close on link click
            mobileOverlay.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', () => {
                    hamburger.classList.remove('active');
                    mobileOverlay.classList.remove('open');
                    hamburger.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                });
            });
            // Close on Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && mobileOverlay.classList.contains('open')) {
                    hamburger.classList.remove('active');
                    mobileOverlay.classList.remove('open');
                    hamburger.setAttribute('aria-expanded', 'false');
                    document.body.style.overflow = '';
                    hamburger.focus();
                }
            });
        }

        // --- HERO TEXT ENTRANCE ---
        gsap.fromTo(".hero-reveal", 
            { y: 50, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.5, ease: "power3.out", stagger: 0.2 }
        );

        // --- NAVBAR ENTRANCE ANIMATION ---
        gsap.fromTo(".site-nav .nav-brand", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: "power3.out" });
        gsap.fromTo(".site-nav .nav-links a, .site-nav .btn-solid", 
            { y: -20, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out", delay: 0.2 }
        );

        // --- NAVBAR SCROLL ANIMATION ---
        const nav = document.querySelector(".site-nav");
        if(nav) {
            window.addEventListener("scroll", () => {
                // Don't apply fixed scrolling classes if it's explicitly absolute (product page)
                const isAbsolute = window.getComputedStyle(nav).position === 'absolute';
                if(window.scrollY > 50 && !isAbsolute) {
                    nav.classList.add("scrolled");
                } else {
                    nav.classList.remove("scrolled");
                }
            });
        }

        // --- BACKGROUND PARALLAX BOTTLE EXACT CAPSUL EFFECT ---
        const mainBottle = document.getElementById('mainBottle');
        if (mainBottle) {
            // Fade in the bottle initially
            gsap.to(mainBottle, { opacity: 1, duration: 2, ease: "power2.out" });

            let mm = gsap.matchMedia();

            // Desktop animation
            mm.add("(min-width: 769px)", () => {
                const tl = gsap.timeline({
                    scrollTrigger: {
                        trigger: "body",
                        start: "top top",
                        endTrigger: "#discover",
                        end: "bottom center",
                        scrub: 1.5
                    }
                });
                tl.to(mainBottle, {
                    scale: 0.6,
                    rotation: 15,
                    xPercent: 30, // move to the right
                    yPercent: -15, // slight lift
                    duration: 1,
                    ease: "power1.inOut"
                });
            });

            // Mobile animation (sweep smoothly to side)
            mm.add("(max-width: 768px)", () => {
                const tl = gsap.timeline({
                    scrollTrigger: {
                        trigger: "body",
                        start: "top top",
                        endTrigger: "#discover",
                        end: "bottom center",
                        scrub: 1.5
                    }
                });
                tl.to(mainBottle, {
                    scale: 0.75,
                    rotation: 12, // changed to positive for right swing
                    xPercent: 35, // Sweeps right elegantly
                    yPercent: -10, // slight lift
                    duration: 1,
                    ease: "power2.inOut"
                });
            });

            // Scroll the entire bottle wrapper up synchronously with the document scroll
            gsap.to(".parallax-bg-wrapper", {
                scrollTrigger: {
                    trigger: "#ingredients",
                    start: "top bottom",
                    end: "top top",
                    scrub: true
                },
                y: () => -window.innerHeight,
                ease: "none"
            });
        }

        // --- SCROLL REVEAL UP ELEMENTS ---
        const revealUpElements = document.querySelectorAll('.gsap-reveal-up');
        revealUpElements.forEach(el => {
            gsap.fromTo(el, 
                { y: 50, autoAlpha: 0 },
                {
                    y: 0, autoAlpha: 1,
                    duration: 1.2,
                    ease: "power3.out",
                    scrollTrigger: {
                        trigger: el,
                        start: "top 85%",
                    }
                }
            );
        });

        // --- SCROLL FADE ELEMENTS ---
        const revealFadeElements = document.querySelectorAll('.gsap-reveal-fade');
        revealFadeElements.forEach(el => {
            gsap.fromTo(el, 
                { autoAlpha: 0 },
                {
                    autoAlpha: 1,
                    duration: 1.5,
                    ease: "power2.out",
                    stagger: 0.1,
                    scrollTrigger: {
                        trigger: el,
                        start: "top 85%",
                    }
                }
            );
        });

        // --- FAQ ACCORDION (with ARIA) ---
        const faqItems = document.querySelectorAll('.faq-item');
        faqItems.forEach(item => {
            const q = item.querySelector('.faq-q');
            const a = item.querySelector('.faq-a');
            if(q && a) {
                q.addEventListener('click', () => {
                    const isOpen = a.style.maxHeight;
                    // Close all others
                    faqItems.forEach(other => {
                        if(other !== item) {
                            const otherA = other.querySelector('.faq-a');
                            const otherQ = other.querySelector('.faq-q');
                            if (otherA) otherA.style.maxHeight = null;
                            if (otherQ) otherQ.setAttribute('aria-expanded', 'false');
                        }
                    });
                    if(isOpen) {
                        a.style.maxHeight = null;
                        q.setAttribute('aria-expanded', 'false');
                    } else {
                        a.style.maxHeight = a.scrollHeight + "px";
                        q.setAttribute('aria-expanded', 'true');
                    }
                });
                // Keyboard support
                q.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        q.click();
                    }
                });
            }
        });

        // --- NEWSLETTER SUBMISSION ---
        const newsletterForm = document.getElementById('newsletterForm');
        if (newsletterForm) {
            newsletterForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const btn = newsletterForm.querySelector('button[type="submit"]');
                const origText = btn.innerText;
                btn.innerText = "SUBSCRIBED";
                btn.style.background = "var(--accent)";
                btn.style.color = "#fff";
                setTimeout(() => {
                    btn.innerText = origText;
                    btn.style.background = "";
                    btn.style.color = "";
                    newsletterForm.reset();
                }, 3000);
            });
        }

        // --- PROMO POPUP ---
        const promoPopup = document.getElementById('promoPopup');
        const promoCloseBtn = document.getElementById('promoCloseBtn');
        const promoDeclineBtn = document.getElementById('promoDeclineBtn');
        const promoForm = document.getElementById('promoForm');

        if (promoPopup && !sessionStorage.getItem('lwangblack_promo_shown')) {
            // Show popup 2.5 seconds after GSAP initialized
            setTimeout(() => {
                promoPopup.classList.add('active');
                // GTM event
                if (window.dataLayer) window.dataLayer.push({ event: 'popup_view', promotion_name: '10% off first order' });
            }, 2500);

            const closePromo = (method) => {
                promoPopup.classList.remove('active');
                sessionStorage.setItem('lwangblack_promo_shown', 'true');
                if (window.dataLayer) window.dataLayer.push({ event: 'popup_dismiss', method: method || 'close' });
            };

            if (promoCloseBtn) promoCloseBtn.addEventListener('click', closePromo);
            if (promoDeclineBtn) promoDeclineBtn.addEventListener('click', closePromo);
            
            // Close on clicking outside the modal content
            promoPopup.addEventListener('click', (e) => {
                if (e.target === promoPopup) closePromo();
            });

            if (promoForm) {
                promoForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const btn = promoForm.querySelector('button[type="submit"]');
                    const origText = btn.innerText;
                    btn.innerText = "OFFER CLAIMED!";
                    btn.style.background = "var(--accent)";
                    btn.style.color = "#fff";
                    setTimeout(() => {
                        closePromo();
                    }, 1500);
                });
            }
        }
    }
});
