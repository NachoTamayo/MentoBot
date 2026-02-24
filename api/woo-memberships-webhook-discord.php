<?php
/*
 Plugin Name: Woo Memberships Webhook + Discord
 Description: Añade user_meta 'discord' al payload de webhooks de Memberships (user_membership.updated) sin reemplazar el payload.
*/

add_filter( 'woocommerce_webhook_payload', function( $payload, $resource, $resource_id, $webhook_id ) {

  // Solo para el recurso de membresías de usuario
  if ( $resource !== 'user_membership' ) return $payload;

  // Asegura que tenemos el objeto webhook para leer el topic
  if ( ! class_exists( 'WC_Webhook' ) ) return $payload;
  $webhook = new WC_Webhook( (int) $webhook_id );

  // Actuar solo en "User Membership Updated"
  if ( $webhook->get_topic() !== 'user_membership.updated' ) return $payload;

  // Requiere WooCommerce Memberships
  if ( ! function_exists( 'wc_memberships_get_user_membership' ) ) return $payload;

  $user_membership = wc_memberships_get_user_membership( (int) $resource_id );
  if ( ! $user_membership ) return $payload;

  $user_id    = (int) $user_membership->get_user_id();
  $discord_id = get_user_meta( $user_id, 'discord', true );

  // Añade dentro de "custom" para no ensuciar la raíz
  if ( ! isset( $payload['custom'] ) || ! is_array( $payload['custom'] ) ) {
    $payload['custom'] = [];
  }
  $payload['custom']['discord'] = $discord_id ?: null;
  $payload['custom']['user_id'] = $user_id;

  return $payload;

}, 10, 4 );