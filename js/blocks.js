// Block catalog. Each block is an HTML string the canvas inserts as-is.
// Pictures point at their own URLs. The app itself does not load a library.
(function () {
  var FONT = 'Arial, Helvetica, sans-serif';
  var TEXT = '#2c2e35';
  var MUTED = '#888686';
  var ACCENT = '#f45e43';
  var INK = '#2c2e35';
  var PAPER = '#f6f6f6';
  var ICON_BG = '#cfd8e0';
  // PNG, not SVG: Gmail and Outlook do not show SVG pictures.
  var PRICE_TAG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAEh0lEQVR42u2ZzW9UZRTGn+e876CttBT6IUNbBpBAmVpdTBkjMbluNOEPuCtXklB3bowmrvwzTGhcuZwYIwtcsIBxYVJKE0xwINEYh+CmxgiJIjj3PcfFzJSPMh+dL8aEk0wyuffOfZ/f+XrPvQM8t+f23HptrH5ihzh2g1isy9/HghiINjdZLM4YUAiD9lb7Xo1jPiJUAdj2S2N3LPfL3n/vSRaUiV9La+cfWceGKgIHl97aq3r/qIObh+prRi4JcAJAGuSEOI8QKqvlH6+sII4dCo2g+wxw5EhuTxjxBwg3b1o5aWSO4BzMjlK4lxSABMxgZjAYYKYwBOd9KmjSNwi2OGevLC7PJ+a+Bywt4hxIADWhZqh9UQOMAEHyYSEDMEucT/l+QUjDM3EsAJBAjoqTOcBENVFNKokmSTANoUoAgnQkPUhXu+dDx5A+JJXEiT+bWcyfQ6EQavdmXwGizU0CgBgWUfVzACjYEkpX83AArHnn6SOEtLpAzRaqCf6kmQKgOO8oztVSwgYN0RCgWHxba30vCzPw8YWM4sTMkhCSSxr0CikkyUFHgs2Op3O5kdQ/riSUjJkqAIGZ0jkxtfWg4cztm1evA0DmxBunIfiSwL5qaTQR1cPClmYdaPQ+JwlOA7p1DCRN7e/EHrx3++bV68jlUlEU+fKNtW9p+hEo9fQaSCSkQQciACTmFykcNavmO8xUxBGma7/duPYTEHlsbFSKxWIAYud3//m1hXCHFNfSmz2CkGYdiAivkwIzPOZRA3YDAHJ/1UcMQQyEey+OgPDtJ3D3EE8FmCnOWK1UF55Y0KkmKuKWDy3m38XGRgWAoVAIKBRC0JEPxbkxVQ1ti+gS4qnjbgkxgSLHp2c/EXIepgZS6uVBggaenpia/WNsZr48tv/A5L6p2Y+F8qmpglvXth0JMQ2Jc6mT49Pp2buXL55HHDuUSh11IQKwyePHx16SPT+LcMbqO+5jaxKkIIRwh8Au8X5UQ9LdrtRBd5JGUGO7xg6IcBzYLr66lplqEkQ4AXJUk0r3zwEdpJM06kBB/TGQL9Q6UIPo0VltoqvNQRg0hDScgTTMiTiaUdt7hOzlkN8+xDavlctlBT6T2ZlrPzwIfr/3/qRpSLDTwuweoq3CZovitsxi/pwTfzYklQSkx6CtRWG7pqkRx+7u5Yvnx6fTs86lhjISzQuvVMLQQiB2QAmtO8cwQkyl5+7+fvGb1hEYVgifWt4zld7/8r7Md+337uGBoJkGcT7/QMOlnW0+zx7CAKiI86p65taNta92vns+O4i6eBe08sGt0voXiGPX2fY/eIhHxCcrt0pXV6Mo8uULF0Ln88vgIJ4Qv74aRZEvFotJ+13o2UE0Fd89QH8hWorvDUB/INoS3zuA3kK0Lb63AL2B2JH43gN0B7Fj8f0B6AyiI/H9A9gZRMfi+wvQHkRX4vsP0ByC3Yof6BBc/9M7k82vHlk6ZZlsvnL41TftYHZ5BQByuVwKQ25bEIey+c8PL53STHb5fQCIosjjf2L1d0gyv5B7p/Ymras0/g9SkJs2oKq6XAAAAABJRU5ErkJggg==';

  function marginStyle(align) {
    if (align === 'center') return 'margin-left:auto;margin-right:auto;';
    if (align === 'right') return 'margin-left:auto;margin-right:0;';
    return 'margin-left:0;margin-right:auto;';
  }

  function img(width, height, label, align) {
    align = align || 'left';
    var src = 'https://placehold.co/' + width + 'x' + height + '/f3f3f3/888686?text=' + encodeURIComponent(label);
    return '<img data-ez="image" src="' + src + '" width="' + width + '" height="' + height + '" alt="' + label + '" align="' + align + '" border="0" ' +
      'style="display:block;float:none;width:' + width + 'px;max-width:100%;height:auto;' + marginStyle(align) +
      'border:0;outline:none;text-decoration:none;text-align:' + align + ';">';
  }

  function button(label, href, bg, align) {
    align = align || 'center';
    var color = bg || ACCENT;
    return '<table data-ez="button" role="presentation" cellpadding="0" cellspacing="0" border="0" align="' + align + '" ' +
      'style="border-collapse:collapse;float:none;' + marginStyle(align) + 'text-align:' + align + ';">' +
      '<tr><td align="center" bgcolor="' + color + '" style="background-color:' + color + ';border-radius:4px;mso-padding-alt:12px 22px;text-align:center;">' +
      '<a href="' + (href || 'https://example.com') + '" style="display:inline-block;padding:12px 22px;' +
      'background-color:' + color + ';color:#ffffff;font-family:' + FONT +
      ';font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;border-radius:4px;text-align:center;">' +
      label + '</a></td></tr></table>';
  }

  function table(inner, extra, align) {
    return '<table data-ez="block" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      (align ? 'align="' + align + '" ' : '') +
      'style="width:100%;margin:0;padding:0;border-collapse:collapse;' + (extra || '') + '">' + inner + '</table>';
  }

  // Same markup as the original EzBuilder: empty columns in a 150px section.
  // Nothing in the column is exported until a block is dropped there.
  function section(widths) {
    var many = widths.length > 1;
    var cells = widths.map(function (width) {
      return '<td valign="top" data-ez="cell"' + (many ? ' data-nl-col="' + width + '" width="' + width + '"' : '') + ' ' +
        'style="padding:0;margin:0;vertical-align:top;' + (many ? 'width:' + width + ';' : '') + '"></td>';
    }).join('');
    return '<table data-nl="section" data-ez="section" width="100%" height="150" ' +
      'style="width:100%;max-width:100%;height:150px;margin:0;padding:0;border-collapse:collapse;border-spacing:0;">' +
      '<tr>' + cells + '</tr></table>';
  }

  function iconText(text) {
    return '<table data-ez="icon-text" data-nl="icon-text" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="' + ICON_BG + '" ' +
      'align="center" style="width:100%;margin:0 auto;padding:0;border-collapse:separate;border-spacing:0;background-color:' + ICON_BG + ';border-radius:12px;">' +
      '<tr>' +
      '<td width="24" valign="middle" align="left" data-nl="icon-cell" style="width:24px;padding:14px 12px 14px 16px;vertical-align:middle;text-align:left;">' +
      '<img src="' + PRICE_TAG + '" width="24" height="24" alt="" border="0" data-nl="icon" data-ez="image" ' +
      'style="display:block;width:24px;min-width:24px;height:24px;border:0;outline:none;text-decoration:none;"></td>' +
      '<td valign="middle" align="left" data-nl="icon-copy" style="padding:14px 16px 14px 0;vertical-align:middle;font-family:' + FONT + ';text-align:left;">' +
      '<p data-ez="text" style="margin:0;font-size:14px;line-height:1.45;color:' + INK + ';">' + text + '</p>' +
      '</td></tr></table>';
  }

  function productCell(name, price) {
    return '<td class="product-column" width="48%" valign="top" align="center" data-ez="cell" ' +
      'style="width:48%;height:100%;vertical-align:top;text-align:center;">' +
      '<table data-ez="block" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
      'style="width:100%;height:100%;border-collapse:collapse;">' +
      '<tr><td class="product-card" align="center" valign="top" ' +
      'style="height:100%;padding:12px;font-family:' + FONT + ';text-align:center;">' +
      img(240, 180, name, 'center') +
      '<h2 data-ez="text" style="margin:12px 0 4px 0;font-size:18px;line-height:1.3;color:' + INK + ';">' + name + '</h2>' +
      '<p data-ez="text" style="margin:0 0 10px 0;font-size:16px;line-height:1.3;color:' + ACCENT + ';font-weight:700;">' + price + '</p>' +
      button('Shop', 'https://example.com') +
      '</td></tr></table></td>';
  }

  function socialLink(name) {
    return '<a href="https://example.com" style="color:' + ACCENT + ';text-decoration:none;">' + name + '</a>';
  }

  var SOCIAL_ICON = 'https://www.mailjet.com/images/theme/v1/icons/ico-social/';
  var SOCIAL_LIGHT = 'https://cdn.tools.unlayer.com/social/icons/circle-white/';
  var LIGHT = {
    facebook: 'facebook.png', twitter: 'twitter.png', x: 'x.png', google: 'googleplus.png',
    instagram: 'instagram.png', youtube: 'youtube.png', pinterest: 'pinterest.png',
    linkedin: 'linkedin.png', snapchat: 'snapchat.png', vimeo: 'vimeo.png',
    tumblr: 'tumblr.png', github: 'github.png', soundcloud: 'soundcloud.png', medium: 'medium.png'
  };
  var NETWORK_ORDER = [
    'facebook', 'twitter', 'x', 'google', 'instagram', 'web', 'youtube', 'pinterest',
    'linkedin', 'snapchat', 'vimeo', 'tumblr', 'github', 'soundcloud', 'medium', 'dribbble', 'xing', 'custom'
  ];
  var NETWORKS = {
    facebook: { label: 'Facebook', color: '#3b5998', file: 'facebook.png' },
    twitter: { label: 'Twitter', color: '#55acee', file: 'twitter.png' },
    x: { label: 'X', color: '#000000', file: 'twitter-x.png' },
    google: { label: 'Google', color: '#dc4e41', file: 'google-plus.png' },
    instagram: { label: 'Instagram', color: '#3f729b', file: 'instagram.png' },
    web: { label: 'Web', color: '#4BADE9', file: 'web.png' },
    youtube: { label: 'YouTube', color: '#EB3323', file: 'youtube.png' },
    pinterest: { label: 'Pinterest', color: '#bd081c', file: 'pinterest.png' },
    linkedin: { label: 'LinkedIn', color: '#0077b5', file: 'linkedin.png' },
    snapchat: { label: 'Snapchat', color: '#FFFA54', file: 'snapchat.png' },
    vimeo: { label: 'Vimeo', color: '#53B4E7', file: 'vimeo.png' },
    tumblr: { label: 'Tumblr', color: '#344356', file: 'tumblr.png' },
    github: { label: 'GitHub', color: '#000000', file: 'github.png' },
    soundcloud: { label: 'SoundCloud', color: '#EF7F31', file: 'soundcloud.png' },
    medium: { label: 'Medium', color: '#000000', file: 'medium.png' },
    dribbble: { label: 'Dribbble', color: '#D95988', file: 'dribbble.png' },
    xing: { label: 'Xing', color: '#296366', file: 'xing.png' },
    custom: { label: 'Custom', color: '#2c2e35', file: '' }
  };

  function iconSrc(name) {
    if (name === 'custom') return 'https://placehold.co/24x24/2c2e35/ffffff?text=Icon';
    var network = NETWORKS[name] || NETWORKS.facebook;
    if (LIGHT[name]) return SOCIAL_LIGHT + LIGHT[name];
    return SOCIAL_ICON + network.file;
  }

  function socialPlate(name) {
    var network = NETWORKS[name] || NETWORKS.facebook;
    var px = 24;
    return '<table data-nl="social-plate" role="presentation" cellpadding="0" cellspacing="0" border="0" width="' + px + '" bgcolor="' + network.color + '" ' +
      'style="width:' + px + 'px;background-color:' + network.color + ';border-radius:12px;border-collapse:separate;border-spacing:0;overflow:hidden;">' +
      '<tr><td align="center" valign="middle" width="' + px + '" height="' + px + '" bgcolor="' + network.color + '" ' +
      'style="width:' + px + 'px;height:' + px + 'px;background-color:' + network.color + ';border-radius:12px;overflow:hidden;font-size:0;line-height:0;vertical-align:middle;text-align:center;">' +
      '<a href="https://example.com" target="_blank" style="text-decoration:none;">' +
      '<img src="' + iconSrc(name) + '" width="' + px + '" height="' + px + '" alt="' + network.label + '" border="0" ' +
      'style="display:block;width:' + px + 'px;height:' + px + 'px;border:0;border-radius:12px;outline:none;text-decoration:none;">' +
      '</a></td></tr></table>';
  }

  function socialCell(name) {
    return '<td data-nl="social-element" data-network="' + name + '" data-ez="social" align="center" valign="middle" ' +
      'style="padding:0 4px;vertical-align:middle;font-size:0;line-height:0;text-align:center;">' + socialPlate(name) + '</td>';
  }

  function socialGroup() {
    var names = ['facebook', 'google', 'twitter'];
    var width = names.length * 32;
    return table(
      '<tr><td data-nl="social-wrap" align="center" valign="middle" style="padding:0;text-align:center;vertical-align:middle;">' +
      '<table data-nl="social-icons" data-nl-gap="8" role="presentation" cellpadding="0" cellspacing="0" border="0" ' +
      'align="center" width="' + width + '" style="width:' + width + 'px;border-collapse:collapse;margin-left:auto;margin-right:auto;">' +
      '<tr data-nl="social-group">' + names.map(socialCell).join('') + '</tr></table></td></tr>'
    );
  }

  var CATALOG = [
    { group: 'Layout', id: 'sect100', label: '1 Section', html: function () {
      return section(['100%']);
    } },
    { group: 'Layout', id: 'sect50', label: '1/2 Section', html: function () {
      return section(['50%', '50%']);
    } },
    { group: 'Layout', id: 'sect30', label: '1/3 Section', html: function () {
      return section(['33.3333%', '33.3333%', '33.3333%']);
    } },
    { group: 'Layout', id: 'sect37', label: '3/7 Section', html: function () {
      return section(['30%', '70%']);
    } },
    { group: 'Basic', id: 'text', label: 'Text', html: function () {
      return '<div data-ez="text" style="padding:10px;">Insert your text here</div>';
    } },
    { group: 'Basic', id: 'text-sect', label: 'Text section', html: function () {
      return '<div data-ez="text" style="padding:10px;font-family:' + FONT + ';color:' + TEXT + ';">' +
        '<h1 data-ez="text" style="margin:0 0 8px;font-size:28px;line-height:1.25;font-weight:700;color:' + INK + ';">Insert title here</h1>' +
        '<p data-ez="text" style="margin:0;font-size:16px;line-height:1.5;">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua</p></div>';
    } },
    { group: 'Basic', id: 'image', label: 'Image', html: function () { return img(260, 180, 'Image', 'center'); } },
    { group: 'Basic', id: 'button', label: 'Button', html: function () { return button('Button', 'https://example.com'); } },
    { group: 'Basic', id: 'divider', label: 'Divider', html: function () {
      return '<table data-ez="divider" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:10px 0;border-collapse:collapse;">' +
        '<tr><td style="border-top:1px solid #e3e5e8;font-size:1px;line-height:1px;">&nbsp;</td></tr></table>';
    } },
    { group: 'Basic', id: 'quote', label: 'Quote', html: function () {
      return '<blockquote data-ez="text" style="margin:0;padding:12px 16px;border-left:4px solid ' + ACCENT + ';font-family:' + FONT + ';font-size:16px;line-height:1.5;color:' + TEXT + ';">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore ipsum dolor sit</blockquote>';
    } },
    { group: 'Basic', id: 'link', label: 'Link', html: function () {
      return '<a data-ez="text" href="https://example.com" style="font-family:' + FONT + ';font-size:15px;color:' + ACCENT + ';text-decoration:underline;">Link</a>';
    } },
    { group: 'Basic', id: 'link-block', label: 'Link block', html: function () {
      return '<a data-ez="link-block" href="https://example.com" style="display:inline-block;min-width:120px;min-height:50px;padding:12px 14px;background-color:' + PAPER + ';font-family:' + FONT + ';font-size:15px;line-height:1.4;color:' + ACCENT + ';text-decoration:underline;">Link block</a>';
    } },
    { group: 'Basic', id: 'grid-items', label: 'Grid items', html: function () {
      function card(title) {
        return '<td width="50%" valign="top" data-ez="cell" style="width:50%;vertical-align:top;padding:8px;font-family:' + FONT + ';text-align:center;">' +
          img(250, 150, title, 'center') +
          '<h2 data-ez="text" style="margin:12px 0 6px;font-size:18px;line-height:1.3;color:' + INK + ';">' + title + '</h2>' +
          '<p data-ez="text" style="margin:0;font-size:14px;line-height:1.5;color:' + MUTED + ';">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt</p></td>';
      }
      return table('<tr>' + card('Title here') + card('Title here') + '</tr>');
    } },
    { group: 'Basic', id: 'list-items', label: 'List items', html: function () {
      function row() {
        return table('<tr><td width="150" valign="top" style="width:150px;padding:8px 12px 8px 0;vertical-align:top;">' + img(150, 150, 'Image', 'left') + '</td>' +
          '<td valign="top" style="padding:8px 0;vertical-align:top;font-family:' + FONT + ';">' +
          '<h2 data-ez="text" style="margin:0 0 6px;font-size:18px;line-height:1.3;color:' + INK + ';">Title here</h2>' +
          '<p data-ez="text" style="margin:0;font-size:14px;line-height:1.5;color:' + MUTED + ';">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt</p></td></tr>');
      }
      return row() + row();
    } },
    { group: 'Email', id: 'email-preview', label: 'Preview text', html: function () {
      return table('<tr><td align="center" style="padding:8px 12px;font-family:' + FONT + ';font-size:12px;line-height:1.4;color:' + MUTED + ';text-align:center;">Preview text shown in the inbox. Replace this sentence.</td></tr>').replace('<table ', '<table data-nl="preheader" ');
    } },
    { group: 'Email', id: 'email-browser', label: 'Browser link', html: function () {
      return table('<tr><td align="center" width="100%" style="width:100%;min-width:100%;padding:8px 12px;font-family:' + FONT + ';font-size:12px;line-height:1.4;text-align:center;">' +
        '<a href="%%view_email_url%%" style="color:' + MUTED + ';text-decoration:underline;">View this email in your browser</a></td></tr>', 'min-width:100%;', 'center');
    } },
    { group: 'Email', id: 'email-logo', label: 'Logo header', html: function () {
      return table('<tr><td align="center" style="padding:16px 12px 8px;text-align:center;">' + img(160, 48, 'Logo', 'center') + '</td></tr>' +
        '<tr><td align="center" style="padding:0 12px 12px;font-family:' + FONT + ';font-size:13px;line-height:1.4;color:' + MUTED + ';text-align:center;">Monthly notes from the team</td></tr>');
    } },
    { group: 'Email', id: 'email-menu', label: 'Menu', html: function () {
      return table('<tr><td align="center" style="padding:8px 0 14px;font-family:' + FONT + ';font-size:14px;line-height:1.4;text-align:center;">' +
        '<a href="https://example.com" style="color:' + ACCENT + ';text-decoration:none;">Stories</a>&nbsp;&nbsp;&nbsp;' +
        '<a href="https://example.com" style="color:' + ACCENT + ';text-decoration:none;">Products</a>&nbsp;&nbsp;&nbsp;' +
        '<a href="https://example.com" style="color:' + ACCENT + ';text-decoration:none;">Events</a>&nbsp;&nbsp;&nbsp;' +
        '<a href="https://example.com" style="color:' + ACCENT + ';text-decoration:none;">Account</a></td></tr>');
    } },
    { group: 'Email', id: 'email-hero', label: 'Hero', html: function () {
      // Same structure as the original: an inner table with spacer rows keeps the
      // copy centered over the picture in old Outlook's VML background.
      function gapRow() {
        return '<tr height="28"><td height="28" style="mso-line-height-rule:exactly;mso-line-height-alt:28px;height:28px;line-height:28px;font-size:28px;">&nbsp;</td></tr>';
      }
      return table('<tr><td align="center" valign="middle" width="100%" height="320" bgcolor="#2c2e35" ' +
        'background="https://placehold.co/600x320/2c2e35/ffffff?text=Hero" ' +
        'style="width:100%;height:320px;background-color:#2c2e35;background-image:url(\'https://placehold.co/600x320/2c2e35/ffffff?text=Hero\');background-repeat:no-repeat;background-position:center center;background-size:cover;text-align:center;font-family:' + FONT + ';">' +
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" height="320" style="width:100%;height:320px;border-collapse:collapse;margin:0;padding:0;">' +
        gapRow() +
        '<tr><td align="center" valign="middle" height="264" style="height:264px;padding:0 32px;text-align:center;font-family:' + FONT + ';">' +
        '<h1 data-ez="text" style="margin:0 0 8px 0;font-size:28px;line-height:1.25;font-weight:700;color:#ffffff;">Headline goes here</h1>' +
        '<p data-ez="text" style="margin:0 0 16px 0;font-size:16px;line-height:1.5;color:#f4f4f4;">One or two sentences that say why this email matters.</p>' +
        button('Read the story', 'https://example.com') + '</td></tr>' +
        gapRow() +
        '</table></td></tr>');
    } },
    { group: 'Email', id: 'email-image-text', label: 'Image + text', html: function () {
      return table('<tr><td width="46%" valign="top" data-ez="cell" style="width:46%;padding:8px 12px 8px 0;vertical-align:top;">' + img(260, 180, 'Image', 'left') + '</td>' +
        '<td width="54%" valign="top" data-ez="cell" style="width:54%;padding:8px 0 8px 12px;vertical-align:top;font-family:' + FONT + ';">' +
        '<h2 data-ez="text" style="margin:0 0 8px;font-size:20px;line-height:1.3;color:' + INK + ';">Article title</h2>' +
        '<p data-ez="text" style="margin:0 0 12px;font-size:15px;line-height:1.5;color:' + MUTED + ';">A short summary. Keep it to a few lines so the row stays even.</p>' +
        '<a href="https://example.com" style="font-size:15px;color:' + ACCENT + ';text-decoration:underline;">Read more</a></td></tr>');
    } },
    { group: 'Email', id: 'email-text-image', label: 'Text + image', html: function () {
      return table('<tr><td width="54%" valign="top" data-ez="cell" style="width:54%;padding:8px 12px 8px 0;vertical-align:top;font-family:' + FONT + ';">' +
        '<h2 data-ez="text" style="margin:0 0 8px;font-size:20px;line-height:1.3;color:' + INK + ';">Article title</h2>' +
        '<p data-ez="text" style="margin:0 0 12px;font-size:15px;line-height:1.5;color:' + MUTED + ';">A short summary. Keep it to a few lines so the row stays even.</p>' +
        '<a href="https://example.com" style="font-size:15px;color:' + ACCENT + ';text-decoration:underline;">Read more</a></td>' +
        '<td width="46%" valign="top" data-ez="cell" style="width:46%;padding:8px 0 8px 12px;vertical-align:top;">' + img(260, 180, 'Image', 'left') + '</td></tr>');
    } },
    { group: 'Email', id: 'email-icon-text', label: 'Icon + text', html: function () {
      return iconText('No te quedes sin descubrir precios increíbles en productos exclusivos para ti.');
    } },
    { group: 'Email', id: 'email-cta', label: 'Call to action', html: function () {
      return table('<tr><td align="center" bgcolor="' + INK + '" style="padding:28px 18px;background-color:' + INK + ';font-family:' + FONT + ';text-align:center;">' +
        '<h2 data-ez="text" style="margin:0 0 8px;font-size:24px;line-height:1.3;color:#ffffff;">Ready when you are</h2>' +
        '<p data-ez="text" style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#f4f4f4;">One sentence on what happens after the click.</p>' +
        button('Get started', 'https://example.com', ACCENT) + '</td></tr>');
    } },
    { group: 'Email', id: 'email-product', label: 'Product', html: function () {
      return table('<tr><td align="center" style="padding:8px 12px;font-family:' + FONT + ';text-align:center;">' +
        img(320, 240, 'Product', 'center') +
        '<h2 data-ez="text" style="margin:14px 0 4px;font-size:20px;line-height:1.3;color:' + INK + ';">Product name</h2>' +
        '<p data-ez="text" style="margin:0 0 6px;font-size:18px;line-height:1.3;color:' + ACCENT + ';font-weight:700;">$48</p>' +
        '<p data-ez="text" style="margin:0 0 14px;font-size:14px;line-height:1.5;color:' + MUTED + ';">One line on why someone would want it.</p>' +
        button('Shop now', 'https://example.com') + '</td></tr>');
    } },
    { group: 'Email', id: 'email-products', label: 'Two products', html: function () {
      return table('<tr>' + productCell('Product one', '$24') +
        '<td class="product-gap" width="4%" valign="top" style="width:4%;font-size:0;line-height:0;">&nbsp;</td>' +
        productCell('Product two', '$36') + '</tr>');
    } },
    { group: 'Email', id: 'email-coupon', label: 'Coupon', html: function () {
      return table('<tr><td align="center" style="padding:18px 16px;border:2px dashed ' + ACCENT + ';background-color:' + PAPER + ';font-family:' + FONT + ';text-align:center;">' +
        '<p data-ez="text" style="margin:0 0 6px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:' + MUTED + ';">Use this code</p>' +
        '<p data-ez="text" style="margin:0 0 8px;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:2px;color:' + INK + ';">SAVE20</p>' +
        '<p data-ez="text" style="margin:0;font-size:13px;line-height:1.4;color:' + MUTED + ';">At checkout. Expires 31 Dec.</p></td></tr>');
    } },
    { group: 'Email', id: 'email-social', label: 'Social links', html: function () {
      return table('<tr><td align="center" style="padding:10px 8px 16px;font-family:' + FONT + ';font-size:14px;line-height:1.4;text-align:center;">' +
        ['Facebook', 'Instagram', 'X', 'LinkedIn', 'YouTube'].map(socialLink).join('&nbsp;&nbsp;&nbsp;') + '</td></tr>');
    } },
    { group: 'Email', id: 'email-social-group', label: 'Group Social', html: socialGroup },
    { group: 'Email', id: 'email-social-element', label: 'Social Element', html: function () { return socialCell('facebook'); } },
    { group: 'Email', id: 'email-footer', label: 'Footer', html: function () {
      return table('<tr><td align="center" bgcolor="' + PAPER + '" style="padding:24px 16px;background-color:' + PAPER + ';font-family:' + FONT + ';font-size:12px;line-height:1.6;color:' + MUTED + ';text-align:center;">' +
        '<p data-ez="text" style="margin:0 0 8px;">Company name<br>123 Street, City, Region, Postal code</p>' +
        '<p style="margin:0 0 8px;"><a href="https://example.com/unsubscribe" style="color:' + MUTED + ';text-decoration:underline;">Unsubscribe</a>' +
        ' &nbsp;|&nbsp; <a href="https://example.com" style="color:' + MUTED + ';text-decoration:underline;">View in browser</a>' +
        ' &nbsp;|&nbsp; <a href="https://example.com/privacy" style="color:' + MUTED + ';text-decoration:underline;">Privacy</a></p>' +
        '<p data-ez="text" style="margin:0;">You received this email because you signed up.</p></td></tr>', 'background-color:' + PAPER + ';');
    } },
    { group: 'Email', id: 'email-spacer', label: 'Spacer', html: function () {
      return '<table data-ez="spacer" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:0;border-collapse:collapse;">' +
        '<tr height="32"><td height="32" style="mso-line-height-rule:exactly;mso-line-height-alt:32px;height:32px;line-height:32px;font-size:32px;">&nbsp;</td></tr></table>';
    } },
    { group: 'Email', id: 'email-hspacer', label: 'Horizontal spacer', html: function () {
      return '<table data-nl="hspacer-drop" data-ez="hspacer" role="presentation" cellpadding="0" cellspacing="0" border="0" width="24" style="width:24px;border-collapse:collapse;"><tr><td style="font-size:0;line-height:0;">&nbsp;</td></tr></table>';
    } },
    { group: 'Email', id: 'email-callout', label: 'Callout', html: function () {
      return table('<tr><td width="4" bgcolor="' + ACCENT + '" style="width:4px;background-color:' + ACCENT + ';font-size:0;line-height:0;">&nbsp;</td>' +
        '<td align="left" style="padding:14px 16px;background-color:#fff4f0;font-family:' + FONT + ';text-align:left;">' +
        '<p data-ez="text" style="margin:0 0 4px;font-size:15px;line-height:1.4;font-weight:700;color:' + INK + ';">A note for the reader</p>' +
        '<p data-ez="text" style="margin:0;font-size:14px;line-height:1.5;color:' + MUTED + ';">Deadlines, shipping changes, or anything they should not miss.</p></td></tr>');
    } },
    { group: 'Email', id: 'email-stats', label: 'Stats', html: function () {
      return table('<tr>' + ['12k|Readers', '48|Issues', '96%|Opens'].map(function (pair) {
        var bits = pair.split('|');
        return '<td width="33%" valign="top" align="center" data-ez="cell" style="width:33%;padding:12px 8px;text-align:center;font-family:' + FONT + ';">' +
          '<p data-ez="text" style="margin:0;font-size:28px;line-height:1.1;font-weight:700;color:' + INK + ';">' + bits[0] + '</p>' +
          '<p data-ez="text" style="margin:4px 0 0;font-size:13px;line-height:1.4;color:' + MUTED + ';">' + bits[1] + '</p></td>';
      }).join('') + '</tr>');
    } },
    { group: 'Email', id: 'email-event', label: 'Event', html: function () {
      return table('<tr><td width="88" valign="top" align="center" bgcolor="' + PAPER + '" style="width:88px;padding:12px 8px;background-color:' + PAPER + ';text-align:center;font-family:' + FONT + ';">' +
        '<div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:' + ACCENT + ';">May</div>' +
        '<div style="font-size:28px;line-height:1.1;font-weight:700;color:' + INK + ';">21</div></td>' +
        '<td valign="top" style="padding:12px 12px 12px 16px;font-family:' + FONT + ';">' +
        '<h2 data-ez="text" style="margin:0 0 4px;font-size:18px;line-height:1.3;color:' + INK + ';">Event name</h2>' +
        '<p data-ez="text" style="margin:0 0 12px;font-size:14px;line-height:1.5;color:' + MUTED + ';">Thursday, 6:00 pm<br>Venue or Online</p>' +
        button('Save a seat', 'https://example.com', null, 'left') + '</td></tr>');
    } },
    { group: 'Email', id: 'email-author', label: 'Author', html: function () {
      return table('<tr><td width="64" valign="middle" style="width:64px;padding:8px 12px 8px 0;vertical-align:middle;">' + img(56, 56, 'Photo', 'left') + '</td>' +
        '<td valign="middle" style="padding:8px 0;vertical-align:middle;font-family:' + FONT + ';">' +
        '<p data-ez="text" style="margin:0;font-size:15px;line-height:1.3;font-weight:700;color:' + TEXT + ';">Author name</p>' +
        '<p data-ez="text" style="margin:2px 0 0;font-size:13px;line-height:1.4;color:' + MUTED + ';">Editor, Company name</p></td></tr>');
    } },
    { group: 'Email', id: 'email-video', label: 'Video link', html: function () {
      return table('<tr><td align="center" style="padding:8px 0;font-family:' + FONT + ';text-align:center;">' +
        '<a href="https://example.com" style="text-decoration:none;">' + img(560, 315, 'Play video', 'center') + '</a>' +
        '<p style="margin:10px 0 0;font-size:14px;line-height:1.4;"><a href="https://example.com" style="color:' + ACCENT + ';text-decoration:underline;">Watch the video</a></p></td></tr>');
    } },
    { group: 'Email', id: 'email-testimonial', label: 'Testimonial', html: function () {
      return table('<tr><td align="left" style="padding:18px 20px;background-color:' + PAPER + ';font-family:' + FONT + ';text-align:left;">' +
        '<p data-ez="text" style="margin:0 0 12px;font-size:18px;line-height:1.45;color:' + INK + ';">\u201cThe sentence you want readers to remember.\u201d</p>' +
        '<p data-ez="text" style="margin:0;font-size:14px;line-height:1.4;color:' + MUTED + ';">Name Surname, Role</p></td></tr>', 'background-color:' + PAPER + ';');
    } }
  ];

  function find(id) {
    for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i];
    return null;
  }

  window.EzBlocks = {
    list: function () { return CATALOG.map(function (item) { return { id: item.id, label: item.label, group: item.group }; }); },
    html: function (id) {
      var item = find(id);
      return item ? item.html() : '';
    },
    // One icon cell, for dropping into an existing Group Social row.
    cell: function (name) { return socialCell(name || 'facebook'); },
    iconSrc: iconSrc,
    networks: NETWORKS,
    networkOrder: NETWORK_ORDER
  };
})();
