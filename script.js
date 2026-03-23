// capsul-in-pro EXACT ANIMATION CLONE (GSAP)
document.addEventListener("DOMContentLoaded", () => {
    
    gsap.registerPlugin(ScrollTrigger);

    // 1. Preloader out animation
    const preloader = document.getElementById('preloader');
    if(preloader) {
        gsap.to(preloader, {
            opacity: 0,
            duration: 1,
            ease: "power2.inOut",
            delay: 0.8,
            onComplete: () => {
                preloader.style.display = 'none';
                initGSAP();
            }
        });
    } else {
        initGSAP();
    }

    function initGSAP() {
        // --- HERO TEXT ENTRANCE ---
        gsap.fromTo(".hero-reveal", 
            { y: 50, opacity: 0 },
            { y: 0, opacity: 1, duration: 1.5, ease: "power3.out", stagger: 0.2 }
        );

        // --- HIDE NAVBAR ON SCROLL ---
        const nav = document.querySelector(".site-nav");
        if(nav) {
            window.addEventListener("scroll", () => {
                if(window.scrollY > 50) {
                    nav.classList.add("hidden");
                } else {
                    nav.classList.remove("hidden");
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
                    rotation: -12,
                    xPercent: -35, // Sweeps left elegantly
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

        // --- FAQ ACCORDION ---
        const faqItems = document.querySelectorAll('.faq-item');
        faqItems.forEach(item => {
            const q = item.querySelector('.faq-q');
            const a = item.querySelector('.faq-a');
            if(q && a) {
                q.addEventListener('click', () => {
                    faqItems.forEach(other => {
                        if(other !== item) {
                            other.querySelector('.faq-a').style.maxHeight = null;
                        }
                    });
                    if(a.style.maxHeight) {
                        a.style.maxHeight = null;
                    } else {
                        a.style.maxHeight = a.scrollHeight + "px";
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
    }
});
