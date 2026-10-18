/* Admin Web Portal – progressive enhancement only. Every page works without JS. */
(function () {
  "use strict";

  // ---------------------------------------------------------------- sidebar --
  var toggle = document.querySelector("[data-nav-toggle]");
  if (toggle) {
    toggle.addEventListener("click", function () {
      document.body.classList.toggle("nav-open");
    });
  }
  document.querySelectorAll("[data-nav-close]").forEach(function (el) {
    el.addEventListener("click", function () {
      document.body.classList.remove("nav-open");
    });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") document.body.classList.remove("nav-open");
  });

  // ------------------------------------------------------- confirm actions --
  document.querySelectorAll("form[data-confirm]").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      if (!window.confirm(form.getAttribute("data-confirm"))) {
        event.preventDefault();
      }
    });
  });

  // ----------------------------------------------------------- flash fade --
  var flash = document.querySelector("[data-flash]");
  if (flash) {
    window.setTimeout(function () {
      flash.style.transition = "opacity .4s ease, transform .4s ease";
      flash.style.opacity = "0";
      flash.style.transform = "translateY(-6px)";
      window.setTimeout(function () { flash.remove(); }, 450);
    }, 4200);
  }

  // -------------------------------------------------------- live filtering --
  var liveForm = document.querySelector("[data-live-search]");
  if (liveForm) {
    var input = liveForm.querySelector('input[name="q"]');
    var timer = null;
    if (input) {
      input.addEventListener("input", function () {
        window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          if (input.value.length === 0 || input.value.length >= 2) {
            liveForm.submit();
          }
        }, 600);
      });
    }
    liveForm.querySelectorAll("select").forEach(function (select) {
      select.addEventListener("change", function () { liveForm.submit(); });
    });
  }

  // ------------------------------------------------------- keyboard focus --
  document.querySelectorAll(".login-page input").forEach(function (el) {
    el.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && el.form) {
        // let the native submit happen
      }
    });
  });
})();
