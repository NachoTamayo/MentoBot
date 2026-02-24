<?php
// === Configuración del webhook ===
if (!defined('MYCRED_WEBHOOK_URL'))    define('MYCRED_WEBHOOK_URL', 'https://65.20.100.145:3010/api/rankUpdated');
if (!defined('MYCRED_WEBHOOK_SECRET')) define('MYCRED_WEBHOOK_SECRET', 'mento_bot_secret');

// Envío firmado (HMAC SHA-256)
if (!function_exists('mycred_send_webhook')) {
  function mycred_send_webhook($payload) {
    $body      = wp_json_encode($payload);
    $signature = hash_hmac('sha256', $body, MYCRED_WEBHOOK_SECRET);

    $response = wp_remote_post(MYCRED_WEBHOOK_URL, array(
      'headers' => array(
        'Content-Type'   => 'application/json',
        'X-Signature'    => $signature,
        'X-Webhook-From' => 'wordpress-mycred',
      ),
      'body'    => $body,
      'timeout' => 10,
    ));

    if (is_wp_error($response)) {
      error_log('[myCRED Webhook] Error: ' . $response->get_error_message());
    }
  }
}

// Espera a que plugins (myCRED) estén cargados
add_action('plugins_loaded', function () {

  // PROMOCIÓN DE RANK
  add_action('mycred_user_got_promoted', function ($user_id, $rank_id, $request) {
    $req    = is_array($request) ? $request : (array) $request;
    $old_id = isset($req['current_id']) ? (int) $req['current_id'] : 0;

    $payload = array(
      'event'       => 'mycred.rank.promoted',
      'user'        => array(
        'id'       => (int) $user_id,
        'email'    => get_the_author_meta('user_email', $user_id),
        'login'    => get_the_author_meta('user_login', $user_id),
        'display'  => get_the_author_meta('display_name', $user_id),
        'discord'  => get_user_meta($user_id, 'discord', true), // Custom user meta field
      ),
      'rank'        => array(
        'new_id'   => (int) $rank_id,
        'new_name' => get_the_title($rank_id),
        'old_id'   => $old_id,
        'old_name' => $old_id ? get_the_title($old_id) : null,
      ),
      'timestamp'   => current_time('mysql', true),
      'site'        => array(
        'home'     => home_url(),
        'blogname' => get_bloginfo('name'),
      ),
    );

    mycred_send_webhook($payload);
  }, 10, 3);

  // DEMOCIÓN DE RANK
  add_action('mycred_user_got_demoted', function ($user_id, $rank_id, $request) {
    $req    = is_array($request) ? $request : (array) $request;
    $old_id = isset($req['current_id']) ? (int) $req['current_id'] : 0;

    $payload = array(
      'event'       => 'mycred.rank.demoted',
      'user'        => array(
        'id'       => (int) $user_id,
        'email'    => get_the_author_meta('user_email', $user_id),
        'login'    => get_the_author_meta('user_login', $user_id),
        'display'  => get_the_author_meta('display_name', $user_id),
        'discord'  => get_user_meta($user_id, 'discord', true), // Custom user meta field
      ),
      'rank'        => array(
        'new_id'   => (int) $rank_id,
        'new_name' => get_the_title($rank_id),
        'old_id'   => $old_id,
        'old_name' => $old_id ? get_the_title($old_id) : null,
      ),
      'timestamp'   => current_time('mysql', true),
      'site'        => array(
        'home'     => home_url(),
        'blogname' => get_bloginfo('name'),
      ),
    );

    mycred_send_webhook($payload);
  }, 10, 3);

}, 20);