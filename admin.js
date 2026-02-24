/**
 * =====================================================
 * SABI ADMIN — Admin Panel Logic
 * =====================================================
 *
 * Handles:
 *   - Admin login & session (localStorage)
 *   - Dashboard: stats, student list, referrer leaderboard
 *   - Filtering by school, searching by name/code
 *   - Student detail view
 *   - Modals: Add Student, Add Lesson, Add Payment, Add Referrer
 *   - Copy-to-clipboard with visual feedback
 *   - All CRUD via Google Apps Script API
 *
 * No frameworks. Pure vanilla JavaScript.
 * =====================================================
 */

(function () {
  'use strict';

  // =====================================================
  // CONFIGURATION
  // =====================================================

  /**
   * ⚠️  Replace this with your actual Google Apps Script Web App URL.
   *     Same URL as in the MVP app.js — it's one backend for everything.
   */
  var API_URL = 'https://script.google.com/macros/s/AKfycbyCcE3b0jh8ES3fRWPnhEcjxUt9oJU1yyJUD6mt4uHe5CkZa6rIKJGk59OzjHb9lyOF/exec';

  var STORAGE_KEY = 'sabi-admin-code';

  // =====================================================
  // STATE
  // =====================================================

  var adminCode = '';
  var allData = {
    students: [],
    lessons: [],
    payments: [],
    referrers: [],
    config: { whatsappNumber: '', appURL: '' }
  };
  var activeSchoolFilter = 'All';
  var searchQuery = '';
  var currentDetailCode = ''; // For student detail view

  // =====================================================
  // DOM REFERENCES
  // =====================================================

  var screenLogin = document.getElementById('screen-login');
  var screenDashboard = document.getElementById('screen-dashboard');
  var screenDetail = document.getElementById('screen-detail');
  var loginForm = document.getElementById('login-form');
  var adminCodeInput = document.getElementById('admin-code-input');
  var loginBtn = document.getElementById('login-btn');
  var loginError = document.getElementById('login-error');
  var toastEl = document.getElementById('toast');

  // Stats
  var statStudents = document.getElementById('stat-students');
  var statLessons = document.getElementById('stat-lessons');
  var statRevenue = document.getElementById('stat-revenue');
  var statPending = document.getElementById('stat-pending');

  // Lists
  var searchInput = document.getElementById('search-input');
  var studentListEl = document.getElementById('student-list');
  var referrerListEl = document.getElementById('referrer-list');

  // Detail
  var detailHeading = document.getElementById('detail-heading');
  var detailInfo = document.getElementById('detail-info');
  var detailPayments = document.getElementById('detail-payments');
  var detailLessons = document.getElementById('detail-lessons');
  var detailActions = document.getElementById('detail-actions');

  // Modal
  var modalOverlay = document.getElementById('modal-overlay');
  var modalContent = document.getElementById('modal-content');

  // =====================================================
  // INIT
  // =====================================================

  function init() {
    bindEvents();

    var saved = getStored(STORAGE_KEY);
    if (saved) {
      adminCode = saved;
      verifyAndLoad();
    }
  }

  // =====================================================
  // EVENT BINDING
  // =====================================================

  function bindEvents() {
    // Login
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      attemptLogin();
    });

    // Top bar buttons
    document.getElementById('btn-add-student').addEventListener('click', function () { openModal('addStudent'); });
    document.getElementById('btn-add-lesson').addEventListener('click', function () { openModal('addLesson'); });
    document.getElementById('btn-add-payment').addEventListener('click', function () { openModal('addPayment'); });
    document.getElementById('btn-add-referrer').addEventListener('click', function () { openModal('addReferrer'); });

    // Search
    searchInput.addEventListener('input', function () {
      searchQuery = searchInput.value.trim().toLowerCase();
      renderStudentList();
    });

    // Filter tabs
    var filterTabs = document.querySelectorAll('.filter-tab');
    filterTabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        filterTabs.forEach(function (t) {
          t.classList.remove('active');
          t.setAttribute('aria-selected', 'false');
        });
        tab.classList.add('active');
        tab.setAttribute('aria-selected', 'true');
        activeSchoolFilter = tab.getAttribute('data-school');
        renderStudentList();
      });
    });

    // Back from detail
    document.getElementById('btn-back').addEventListener('click', function () {
      showScreen('dashboard');
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', function () {
      clearStored(STORAGE_KEY);
      adminCode = '';
      showScreen('login');
      adminCodeInput.value = '';
    });

    // Modal overlay click to close
    modalOverlay.addEventListener('click', function (e) {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });

    // Escape key closes modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modalOverlay.hidden) {
        closeModal();
      }
    });
  }

  // =====================================================
  // AUTH
  // =====================================================

  function attemptLogin() {
    var code = adminCodeInput.value.trim();
    if (!code) return;

    loginBtn.disabled = true;
    loginBtn.textContent = '...';
    hideLoginError();

    adminCode = code;
    store(STORAGE_KEY, code);

    // Verify by fetching stats
    apiGet('stats', { adminCode: code })
      .then(function (data) {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Enter →';

        if (data.success) {
          loadAllData();
        } else {
          showLoginError('Invalid admin code');
          clearStored(STORAGE_KEY);
          adminCode = '';
        }
      })
      .catch(function () {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Enter →';
        showLoginError('Connection error. Try again.');
      });
  }

  function verifyAndLoad() {
    apiGet('stats', { adminCode: adminCode })
      .then(function (data) {
        if (data.success) {
          loadAllData();
        } else {
          clearStored(STORAGE_KEY);
          adminCode = '';
          showScreen('login');
        }
      })
      .catch(function () {
        // If offline, still show login
        showScreen('login');
      });
  }

  function showLoginError(msg) {
    loginError.textContent = msg;
    loginError.classList.add('visible');
    adminCodeInput.classList.add('error');
    setTimeout(function () { adminCodeInput.classList.remove('error'); }, 450);
  }

  function hideLoginError() {
    loginError.textContent = '';
    loginError.classList.remove('visible');
  }

  // =====================================================
  // DATA LOADING
  // =====================================================

  function loadAllData() {
    apiGet('admin', { adminCode: adminCode })
      .then(function (data) {
        if (data.success) {
          allData.students = data.students || [];
          allData.lessons = data.lessons || [];
          allData.payments = data.payments || [];
          allData.referrers = data.referrers || [];
          allData.config = data.config || { whatsappNumber: '', appURL: '' };

          renderDashboard();
          showScreen('dashboard');
        } else {
          showScreen('login');
          showLoginError('Session expired. Please log in again.');
          clearStored(STORAGE_KEY);
          adminCode = '';
        }
      })
      .catch(function () {
        showScreen('login');
        showLoginError('Connection error.');
      });
  }

  // =====================================================
  // RENDER DASHBOARD
  // =====================================================

  function renderDashboard() {
    renderStats();
    renderStudentList();
    renderReferrerList();
  }

  function renderStats() {
    var students = allData.students;
    var lessons = allData.lessons;
    var payments = allData.payments;

    var totalRevenue = 0;
    payments.forEach(function (p) { totalRevenue += Number(p.Amount) || 0; });

    var studentsWithLessons = {};
    lessons.forEach(function (l) { studentsWithLessons[l.StudentCode] = true; });
    var pending = 0;
    students.forEach(function (s) { if (!studentsWithLessons[s.Code]) pending++; });

    statStudents.textContent = students.length;
    statLessons.textContent = lessons.length;
    statRevenue.textContent = '₦' + formatNumber(totalRevenue);
    statPending.textContent = pending;
  }

  // =====================================================
  // STUDENT LIST
  // =====================================================

  function renderStudentList() {
    var students = allData.students.slice();
    var lessons = allData.lessons;

    // Build a set of student codes that have lessons
    var codesWithLessons = {};
    lessons.forEach(function (l) { codesWithLessons[l.StudentCode] = true; });

    // Filter by school
    if (activeSchoolFilter !== 'All') {
      students = students.filter(function (s) { return s.School === activeSchoolFilter; });
    }

    // Filter by search query
    if (searchQuery) {
      students = students.filter(function (s) {
        return (s.Name && s.Name.toLowerCase().indexOf(searchQuery) !== -1) ||
               (s.Code && s.Code.toLowerCase().indexOf(searchQuery) !== -1);
      });
    }

    // Sort by CreatedAt descending (newest first)
    students.sort(function (a, b) {
      var da = new Date(a.CreatedAt || 0);
      var db = new Date(b.CreatedAt || 0);
      return db - da;
    });

    if (students.length === 0) {
      studentListEl.innerHTML = '<div class="empty-state">' +
        (searchQuery ? 'No students match your search.' : 'No students yet.') +
        '</div>';
      return;
    }

    var html = '';
    students.forEach(function (s) {
      var isPending = !codesWithLessons[s.Code];
      var icon = isPending ? '⏳' : '✅';
      var dateStr = formatShortDate(s.CreatedAt);

      html += '<div class="student-row' + (isPending ? ' pending' : '') + '" data-code="' + esc(s.Code) + '">' +
        '<span class="student-row-icon">' + icon + '</span>' +
        '<span class="student-row-code">' + esc(s.Code) + '</span>' +
        '<span class="student-row-name">' + esc(s.Name) + '</span>' +
        '<span class="student-row-meta">' +
          '<span class="student-row-school">' + esc(s.School || '') + '</span><br>' +
          '<span>' + dateStr + '</span>' +
        '</span>' +
        '</div>';
    });

    studentListEl.innerHTML = html;

    // Bind click events
    var rows = studentListEl.querySelectorAll('.student-row');
    rows.forEach(function (row) {
      row.addEventListener('click', function () {
        var code = row.getAttribute('data-code');
        openStudentDetail(code);
      });
    });
  }

  // =====================================================
  // REFERRER LIST
  // =====================================================

  function renderReferrerList() {
    var referrers = allData.referrers;
    var students = allData.students;

    if (referrers.length === 0) {
      referrerListEl.innerHTML = '<div class="empty-state">No referrers yet.</div>';
      return;
    }

    // Calculate stats for each referrer
    var refStats = referrers.map(function (r) {
      var count = 0;
      students.forEach(function (s) {
        if (s.Referrer === r.CodeName) count++;
      });
      var earned = count * 200;
      var paidOut = Number(r.TotalPaidOut) || 0;
      return {
        codeName: r.CodeName,
        fullName: r.FullName,
        referred: count,
        earned: earned,
        paidOut: paidOut,
        outstanding: earned - paidOut
      };
    });

    // Sort by referred count descending
    refStats.sort(function (a, b) { return b.referred - a.referred; });

    var html = '';
    refStats.forEach(function (r) {
      html += '<div class="referrer-row">' +
        '<span class="referrer-code">' + esc(r.codeName) + '</span>' +
        '<span class="referrer-stats-text">' + r.referred + ' referred · ₦' + formatNumber(r.earned) + ' earned</span>' +
        '<span class="referrer-outstanding">' + (r.outstanding > 0 ? '₦' + formatNumber(r.outstanding) + ' owed' : '—') + '</span>' +
        '</div>';
    });

    referrerListEl.innerHTML = html;
  }

  // =====================================================
  // STUDENT DETAIL VIEW
  // =====================================================

  function openStudentDetail(code) {
    currentDetailCode = code;

    var student = allData.students.find(function (s) { return s.Code === code; });
    if (!student) return;

    var studentLessons = allData.lessons.filter(function (l) { return l.StudentCode === code; });
    var studentPayments = allData.payments.filter(function (p) { return p.StudentCode === code; });

    // Heading
    detailHeading.textContent = code + ' — ' + student.Name;

    // Info grid
    var referrerText = student.Referrer ? student.Referrer : '—';
    var phone = student.Phone || '';
    var whatsappLink = phone ? 'https://wa.me/' + phone.replace(/^0/, '234').replace(/[^0-9]/g, '') : '#';

    detailInfo.innerHTML =
      '<div class="detail-info-row"><span class="detail-info-label">School</span><span class="detail-info-value">' + esc(student.School || '') + '</span></div>' +
      '<div class="detail-info-row"><span class="detail-info-label">Department</span><span class="detail-info-value">' + esc(student.Department || '') + '</span></div>' +
      '<div class="detail-info-row"><span class="detail-info-label">Interests</span><span class="detail-info-value">' + esc(student.Interest1 || '') + ', ' + esc(student.Interest2 || '') + '</span></div>' +
      '<div class="detail-info-row"><span class="detail-info-label">Referred by</span><span class="detail-info-value">' + esc(referrerText) + '</span></div>' +
      '<div class="detail-info-row">' +
        '<span class="detail-info-label">Phone</span>' +
        '<span class="detail-info-value">' + esc(phone) + '</span>' +
        '<div class="detail-info-actions">' +
          '<button class="btn-icon" data-action="copy" data-text="' + esc(phone) + '">Copy</button>' +
          '<a href="' + whatsappLink + '" target="_blank" rel="noopener" class="btn-icon" style="text-decoration:none;display:inline-flex;align-items:center;">WhatsApp</a>' +
        '</div>' +
      '</div>';

    // Bind copy buttons in detail info
    detailInfo.querySelectorAll('[data-action="copy"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        copyToClipboard(btn.getAttribute('data-text'));
        showToast('Copied!');
      });
    });

    // Payments
    if (studentPayments.length > 0) {
      var payHtml = '';
      var totalPaid = 0;
      studentPayments.forEach(function (p) {
        var amt = Number(p.Amount) || 0;
        totalPaid += amt;
        payHtml += '<div class="detail-payment-row">' +
          '<span class="detail-payment-amount">₦' + formatNumber(amt) + '</span>' +
          '<span class="detail-payment-meta">' +
            (p.PDFPages ? p.PDFPages + ' pages · ' : '') +
            formatShortDate(p.PaidAt) +
            (p.Notes ? ' · ' + esc(p.Notes) : '') +
          '</span>' +
          '</div>';
      });
      payHtml += '<div class="detail-total">Total Paid: ₦' + formatNumber(totalPaid) + '</div>';
      detailPayments.innerHTML = payHtml;
    } else {
      detailPayments.innerHTML = '<div class="detail-empty">No payments recorded.</div>';
    }

    // Lessons
    if (studentLessons.length > 0) {
      var lesHtml = '';
      studentLessons.forEach(function (l) {
        lesHtml += '<div class="detail-lesson-row">' +
          '<span class="detail-lesson-subject">' + esc(l.Subject) + (l.CourseCode ? ' · ' + esc(l.CourseCode) : '') + '</span>' +
          '<span class="detail-lesson-meta">' + formatShortDate(l.DeliveredAt) + '</span>' +
          '</div>';
      });
      detailLessons.innerHTML = lesHtml;
    } else {
      detailLessons.innerHTML = '<div class="detail-empty">No lessons yet.</div>';
    }

    // Actions
    detailActions.innerHTML =
      '<button class="btn-outline" id="detail-add-lesson">+ Add Lesson</button>' +
      '<button class="btn-outline" id="detail-add-payment">+ Record Payment</button>' +
      '<a href="' + whatsappLink + '" target="_blank" rel="noopener" class="btn-outline" style="text-decoration:none;text-align:center;">💬 WhatsApp</a>';

    document.getElementById('detail-add-lesson').addEventListener('click', function () {
      openModal('addLesson', code);
    });
    document.getElementById('detail-add-payment').addEventListener('click', function () {
      openModal('addPayment', code);
    });

    showScreen('detail');
  }

  // =====================================================
  // MODALS
  // =====================================================

  function openModal(type, preSelectedCode) {
    var html = '';

    switch (type) {
      case 'addStudent':
        html = buildAddStudentModal();
        break;
      case 'addLesson':
        html = buildAddLessonModal(preSelectedCode);
        break;
      case 'addPayment':
        html = buildAddPaymentModal(preSelectedCode);
        break;
      case 'addReferrer':
        html = buildAddReferrerModal();
        break;
    }

    modalContent.innerHTML = html;
    modalOverlay.hidden = false;

    // Trigger visibility for transition
    requestAnimationFrame(function () {
      modalOverlay.classList.add('visible');
    });

    // Bind modal-specific events
    switch (type) {
      case 'addStudent':
        bindAddStudentModal();
        break;
      case 'addLesson':
        bindAddLessonModal(preSelectedCode);
        break;
      case 'addPayment':
        bindAddPaymentModal(preSelectedCode);
        break;
      case 'addReferrer':
        bindAddReferrerModal();
        break;
    }

    // Focus first input
    var firstInput = modalContent.querySelector('input, select');
    if (firstInput) {
      setTimeout(function () { firstInput.focus(); }, 100);
    }
  }

  function closeModal() {
    modalOverlay.classList.remove('visible');
    setTimeout(function () {
      modalOverlay.hidden = true;
      modalContent.innerHTML = '';
    }, 200);
  }

  // ---- ADD STUDENT MODAL ---- //

  function buildAddStudentModal() {
    return '<h3 class="modal-title">Add Student</h3>' +
      '<div class="form-group">' +
        '<label class="form-label">Name *</label>' +
        '<input type="text" id="m-name" class="form-input" placeholder="e.g. Emeka Okafor" required>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Phone *</label>' +
        '<input type="text" id="m-phone" class="form-input" placeholder="e.g. 08012345678" required>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">School *</label>' +
        '<select id="m-school" class="form-select">' +
          '<option value="FULAFIA">FULAFIA</option>' +
          '<option value="ATBU">ATBU</option>' +
          '<option value="UNIBEN">UNIBEN</option>' +
        '</select>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Department *</label>' +
        '<input type="text" id="m-dept" class="form-input" placeholder="e.g. Computer Science" required>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Interest 1 *</label>' +
        '<input type="text" id="m-int1" class="form-input" placeholder="e.g. Football" required>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Interest 2 *</label>' +
        '<input type="text" id="m-int2" class="form-input" placeholder="e.g. Cooking" required>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Referrer</label>' +
        '<input type="text" id="m-referrer" class="form-input" placeholder="e.g. CHIDI (optional)" style="text-transform:uppercase">' +
      '</div>' +
      '<div id="m-form-error" class="form-error"></div>' +
      '<div class="modal-buttons">' +
        '<button type="button" id="m-cancel" class="btn-ghost">Cancel</button>' +
        '<button type="button" id="m-submit" class="btn-primary">Add Student →</button>' +
      '</div>';
  }

  function bindAddStudentModal() {
    var cancelBtn = document.getElementById('m-cancel');
    var submitBtn = document.getElementById('m-submit');

    cancelBtn.addEventListener('click', closeModal);

    submitBtn.addEventListener('click', function () {
      var name = val('m-name');
      var phone = val('m-phone');
      var school = val('m-school');
      var dept = val('m-dept');
      var int1 = val('m-int1');
      var int2 = val('m-int2');
      var referrer = val('m-referrer').toUpperCase();

      if (!name || !phone || !school || !dept || !int1 || !int2) {
        document.getElementById('m-form-error').textContent = 'Please fill in all required fields.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '...';

      apiPost('addStudent', {
        name: name,
        phone: phone,
        school: school,
        department: dept,
        interest1: int1,
        interest2: int2,
        referrer: referrer,
        adminCode: adminCode
      })
        .then(function (data) {
          if (data.success) {
            var code = data.code;
            var appURL = allData.config.appURL || 'trysabi.netlify.app';

            var fullMsg = 'Your code is ' + code + '\n\nGo to ' + appURL + ' and enter your code to access your lessons.\n\nSave this message! 🔥';

            modalContent.innerHTML =
              '<div class="modal-success">' +
                '<div class="modal-success-icon">✅</div>' +
                '<div class="modal-success-text">Student added!</div>' +
                '<div class="modal-success-code">' + code + '</div>' +
                '<div class="modal-success-buttons">' +
                  '<button class="btn-copy" id="ms-copy-code">Copy Code</button>' +
                  '<button class="btn-copy" id="ms-copy-msg">Copy Message</button>' +
                '</div>' +
                '<button class="btn-success-done" id="ms-done">Done</button>' +
              '</div>';

            document.getElementById('ms-copy-code').addEventListener('click', function () {
              copyToClipboard(code);
              showToast('Code copied!');
            });
            document.getElementById('ms-copy-msg').addEventListener('click', function () {
              copyToClipboard(fullMsg);
              showToast('Message copied!');
            });
            document.getElementById('ms-done').addEventListener('click', function () {
              closeModal();
              loadAllData();
            });
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Student →';
            document.getElementById('m-form-error').textContent = data.error || 'Something went wrong.';
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Add Student →';
          document.getElementById('m-form-error').textContent = 'Connection error. Try again.';
        });
    });
  }

  // ---- ADD LESSON MODAL ---- //

  function buildAddLessonModal(preSelectedCode) {
    var studentOptions = buildStudentSearchHTML(preSelectedCode);

    return '<h3 class="modal-title">Add Lesson</h3>' +
      '<div class="form-group">' +
        '<label class="form-label">Student *</label>' +
        '<div class="student-search-container">' +
          '<input type="text" id="m-student-search" class="form-input" placeholder="Search by code or name..." autocomplete="off" ' +
            (preSelectedCode ? 'value="' + esc(getStudentLabel(preSelectedCode)) + '"' : '') + '>' +
          '<input type="hidden" id="m-student-code" value="' + (preSelectedCode || '') + '">' +
          '<div id="m-student-dropdown" class="student-dropdown" hidden>' + studentOptions + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Subject *</label>' +
        '<input type="text" id="m-subject" class="form-input" placeholder="e.g. Data Structures">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Course Code</label>' +
        '<input type="text" id="m-coursecode" class="form-input" placeholder="e.g. CSC 201">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Folder Path *</label>' +
        '<input type="text" id="m-folderpath" class="form-input" placeholder="e.g. FLAME-dsa">' +
        '<div class="form-helper">Must match the folder name in your GitHub repo under /lessons/</div>' +
      '</div>' +
      '<div id="m-form-error" class="form-error"></div>' +
      '<div class="modal-buttons">' +
        '<button type="button" id="m-cancel" class="btn-ghost">Cancel</button>' +
        '<button type="button" id="m-submit" class="btn-primary">Add Lesson →</button>' +
      '</div>';
  }

  function bindAddLessonModal(preSelectedCode) {
    var cancelBtn = document.getElementById('m-cancel');
    var submitBtn = document.getElementById('m-submit');

    cancelBtn.addEventListener('click', closeModal);

    // Student search dropdown
    bindStudentSearch();

    submitBtn.addEventListener('click', function () {
      var studentCode = val('m-student-code');
      var subject = val('m-subject');
      var courseCode = val('m-coursecode');
      var folderPath = val('m-folderpath');

      if (!studentCode || !subject || !folderPath) {
        document.getElementById('m-form-error').textContent = 'Please fill in student, subject, and folder path.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '...';

      apiPost('addLesson', {
        studentCode: studentCode,
        subject: subject,
        courseCode: courseCode,
        folderPath: folderPath,
        adminCode: adminCode
      })
        .then(function (data) {
          if (data.success) {
            var student = allData.students.find(function (s) { return s.Code === studentCode; });
            var name = student ? student.Name : studentCode;
            var code = studentCode;
            var appURL = allData.config.appURL || 'trysabi.netlify.app';

            var notifMsg = 'Hey ' + name + '! Your ' + subject + ' lesson is ready 🔥\n\nGo to ' + appURL + ' → enter your code: ' + code + '\n\nEnjoy!';

            modalContent.innerHTML =
              '<div class="modal-success">' +
                '<div class="modal-success-icon">✅</div>' +
                '<div class="modal-success-text">Lesson added!</div>' +
                '<div class="modal-success-buttons">' +
                  '<button class="btn-copy" id="ms-copy-notif">Copy Notification</button>' +
                '</div>' +
                '<button class="btn-success-done" id="ms-done">Done</button>' +
              '</div>';

            document.getElementById('ms-copy-notif').addEventListener('click', function () {
              copyToClipboard(notifMsg);
              showToast('Notification copied!');
            });
            document.getElementById('ms-done').addEventListener('click', function () {
              closeModal();
              loadAllData();
            });
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Lesson →';
            document.getElementById('m-form-error').textContent = data.error || 'Something went wrong.';
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Add Lesson →';
          document.getElementById('m-form-error').textContent = 'Connection error. Try again.';
        });
    });
  }

  // ---- ADD PAYMENT MODAL ---- //

  function buildAddPaymentModal(preSelectedCode) {
    return '<h3 class="modal-title">Record Payment</h3>' +
      '<div class="form-group">' +
        '<label class="form-label">Student *</label>' +
        '<div class="student-search-container">' +
          '<input type="text" id="m-student-search" class="form-input" placeholder="Search by code or name..." autocomplete="off" ' +
            (preSelectedCode ? 'value="' + esc(getStudentLabel(preSelectedCode)) + '"' : '') + '>' +
          '<input type="hidden" id="m-student-code" value="' + (preSelectedCode || '') + '">' +
          '<div id="m-student-dropdown" class="student-dropdown" hidden>' + buildStudentSearchHTML(preSelectedCode) + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Amount (₦) *</label>' +
        '<div class="form-input-prefix">' +
          '<input type="number" id="m-amount" class="form-input" placeholder="e.g. 500">' +
        '</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">PDF Pages</label>' +
        '<input type="number" id="m-pages" class="form-input" placeholder="e.g. 45 (optional)">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Notes</label>' +
        '<input type="text" id="m-notes" class="form-input" placeholder="Optional">' +
      '</div>' +
      '<div id="m-form-error" class="form-error"></div>' +
      '<div class="modal-buttons">' +
        '<button type="button" id="m-cancel" class="btn-ghost">Cancel</button>' +
        '<button type="button" id="m-submit" class="btn-primary">Record →</button>' +
      '</div>';
  }

  function bindAddPaymentModal(preSelectedCode) {
    var cancelBtn = document.getElementById('m-cancel');
    var submitBtn = document.getElementById('m-submit');

    cancelBtn.addEventListener('click', closeModal);
    bindStudentSearch();

    submitBtn.addEventListener('click', function () {
      var studentCode = val('m-student-code');
      var amount = val('m-amount');
      var pages = val('m-pages');
      var notes = val('m-notes');

      if (!studentCode || !amount) {
        document.getElementById('m-form-error').textContent = 'Please select a student and enter an amount.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '...';

      apiPost('addPayment', {
        studentCode: studentCode,
        amount: Number(amount),
        pdfPages: pages ? Number(pages) : '',
        notes: notes,
        adminCode: adminCode
      })
        .then(function (data) {
          if (data.success) {
            modalContent.innerHTML =
              '<div class="modal-success">' +
                '<div class="modal-success-icon">✅</div>' +
                '<div class="modal-success-text">Payment recorded!</div>' +
                '<button class="btn-success-done" id="ms-done">Done</button>' +
              '</div>';

            document.getElementById('ms-done').addEventListener('click', function () {
              closeModal();
              loadAllData();
            });
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Record →';
            document.getElementById('m-form-error').textContent = data.error || 'Something went wrong.';
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Record →';
          document.getElementById('m-form-error').textContent = 'Connection error. Try again.';
        });
    });
  }

  // ---- ADD REFERRER MODAL ---- //

  function buildAddReferrerModal() {
    return '<h3 class="modal-title">Add Referrer</h3>' +
      '<div class="form-group">' +
        '<label class="form-label">Code Name *</label>' +
        '<input type="text" id="m-codename" class="form-input" placeholder="e.g. CHIDI" style="text-transform:uppercase">' +
        '<div class="form-helper">This is what goes in students\' Referrer field</div>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Full Name *</label>' +
        '<input type="text" id="m-fullname" class="form-input" placeholder="e.g. Chidi Okonkwo">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">Phone *</label>' +
        '<input type="text" id="m-phone" class="form-input" placeholder="e.g. 08012345678">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label">School *</label>' +
        '<select id="m-school" class="form-select">' +
          '<option value="FULAFIA">FULAFIA</option>' +
          '<option value="ATBU">ATBU</option>' +
          '<option value="UNIBEN">UNIBEN</option>' +
        '</select>' +
      '</div>' +
      '<div id="m-form-error" class="form-error"></div>' +
      '<div class="modal-buttons">' +
        '<button type="button" id="m-cancel" class="btn-ghost">Cancel</button>' +
        '<button type="button" id="m-submit" class="btn-primary">Add Referrer →</button>' +
      '</div>';
  }

  function bindAddReferrerModal() {
    var cancelBtn = document.getElementById('m-cancel');
    var submitBtn = document.getElementById('m-submit');

    cancelBtn.addEventListener('click', closeModal);

    submitBtn.addEventListener('click', function () {
      var codeName = val('m-codename').toUpperCase();
      var fullName = val('m-fullname');
      var phone = val('m-phone');
      var school = val('m-school');

      if (!codeName || !fullName || !phone || !school) {
        document.getElementById('m-form-error').textContent = 'Please fill in all required fields.';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '...';

      apiPost('addReferrer', {
        codeName: codeName,
        fullName: fullName,
        phone: phone,
        school: school,
        adminCode: adminCode
      })
        .then(function (data) {
          if (data.success) {
            var waNumber = allData.config.whatsappNumber || '';
            var waLink = waNumber
              ? 'wa.me/' + waNumber + '?text=Hey!%20I%20need%20a%20lesson%20-%20ref%3A' + encodeURIComponent(codeName)
              : '(set WhatsApp number in Config sheet first)';

            modalContent.innerHTML =
              '<div class="modal-success">' +
                '<div class="modal-success-icon">✅</div>' +
                '<div class="modal-success-text">Referrer added!</div>' +
                '<div class="modal-success-buttons">' +
                  '<button class="btn-copy btn-copy-wa" id="ms-copy-link">Copy wa.me Link</button>' +
                '</div>' +
                '<button class="btn-success-done" id="ms-done">Done</button>' +
              '</div>';

            document.getElementById('ms-copy-link').addEventListener('click', function () {
              copyToClipboard(waLink);
              showToast('Link copied!');
            });
            document.getElementById('ms-done').addEventListener('click', function () {
              closeModal();
              loadAllData();
            });
          } else {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Referrer →';
            document.getElementById('m-form-error').textContent = data.error || 'Something went wrong.';
          }
        })
        .catch(function () {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Add Referrer →';
          document.getElementById('m-form-error').textContent = 'Connection error. Try again.';
        });
    });
  }

  // =====================================================
  // STUDENT SEARCH (MODAL DROPDOWN)
  // =====================================================

  function buildStudentSearchHTML() {
    var html = '';
    allData.students.forEach(function (s) {
      html += '<button class="student-dropdown-item" data-code="' + esc(s.Code) + '" data-label="' + esc(s.Code + ' — ' + s.Name) + '">' +
        '<span class="student-dropdown-code">' + esc(s.Code) + '</span> — ' + esc(s.Name) +
        '</button>';
    });
    return html;
  }

  function getStudentLabel(code) {
    var s = allData.students.find(function (st) { return st.Code === code; });
    return s ? (s.Code + ' — ' + s.Name) : code;
  }

  function bindStudentSearch() {
    var searchEl = document.getElementById('m-student-search');
    var hiddenEl = document.getElementById('m-student-code');
    var dropdownEl = document.getElementById('m-student-dropdown');

    if (!searchEl || !dropdownEl) return;

    searchEl.addEventListener('focus', function () {
      filterStudentDropdown('');
      dropdownEl.hidden = false;
    });

    searchEl.addEventListener('input', function () {
      var q = searchEl.value.toLowerCase();
      hiddenEl.value = ''; // Clear selection when typing
      filterStudentDropdown(q);
      dropdownEl.hidden = false;
    });

    // Close dropdown on click outside
    document.addEventListener('click', function handler(e) {
      if (!searchEl.contains(e.target) && !dropdownEl.contains(e.target)) {
        dropdownEl.hidden = true;
      }
    });

    // Bind dropdown items
    dropdownEl.addEventListener('click', function (e) {
      var item = e.target.closest('.student-dropdown-item');
      if (item) {
        var code = item.getAttribute('data-code');
        var label = item.getAttribute('data-label');
        searchEl.value = label;
        hiddenEl.value = code;
        dropdownEl.hidden = true;
      }
    });
  }

  function filterStudentDropdown(query) {
    var dropdownEl = document.getElementById('m-student-dropdown');
    if (!dropdownEl) return;

    var items = dropdownEl.querySelectorAll('.student-dropdown-item');
    var hasVisible = false;

    items.forEach(function (item) {
      var label = item.getAttribute('data-label').toLowerCase();
      if (!query || label.indexOf(query) !== -1) {
        item.style.display = 'block';
        hasVisible = true;
      } else {
        item.style.display = 'none';
      }
    });

    if (!hasVisible) {
      dropdownEl.hidden = true;
    }
  }

  // =====================================================
  // SCREEN MANAGEMENT
  // =====================================================

  function showScreen(name) {
    screenLogin.classList.remove('active');
    screenDashboard.classList.remove('active');
    screenDetail.classList.remove('active');

    switch (name) {
      case 'login':
        screenLogin.classList.add('active');
        break;
      case 'dashboard':
        screenDashboard.classList.add('active');
        window.scrollTo(0, 0);
        break;
      case 'detail':
        screenDetail.classList.add('active');
        window.scrollTo(0, 0);
        break;
    }
  }

  // =====================================================
  // API HELPERS
  // =====================================================

  function apiGet(action, params) {
    var url = API_URL + '?action=' + action;
    if (params) {
      Object.keys(params).forEach(function (key) {
        url += '&' + encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      });
    }
    return fetch(url).then(function (r) { return r.json(); });
  }

  function apiPost(action, body) {
    body.action = action;
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatNumber(n) {
    return Number(n).toLocaleString('en-NG');
  }

  function formatShortDate(dateStr) {
    if (!dateStr) return '';
    try {
      var d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[d.getMonth()] + ' ' + d.getDate();
    } catch (e) {
      return String(dateStr);
    }
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* silent */ }
    document.body.removeChild(ta);
  }

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('visible');
    setTimeout(function () {
      toastEl.classList.remove('visible');
    }, 1800);
  }

  // =====================================================
  // localStorage HELPERS
  // =====================================================

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* silent */ }
  }

  function getStored(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }

  function clearStored(key) {
    try { localStorage.removeItem(key); } catch (e) { /* silent */ }
  }

  // =====================================================
  // BOOT
  // =====================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();