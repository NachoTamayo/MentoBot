<?php
/*
 Plugin Name: Woo Webhook Payload + Discord (custom block)
*/

add_filter( 'woocommerce_webhook_payload', function( $payload, $resource, $resource_id, $webhook_id ) {
  if ( $resource !== 'subscription' ) return $payload;

  if ( ! class_exists( 'WC_Webhook' ) ) return $payload;
  $webhook = new WC_Webhook( (int) $webhook_id );
  if ( $webhook->get_topic() !== 'subscription.updated' ) return $payload;

  if ( ! function_exists( 'wcs_get_subscription' ) ) return $payload;

  $subscription = wcs_get_subscription( (int) $resource_id );
  if ( ! $subscription ) return $payload;

  $user_id    = (int) $subscription->get_user_id();
  $discord_id = get_user_meta( $user_id, 'discord', true );

  // Asegura que custom es un array y añade discord
  if ( ! isset( $payload['custom'] ) || ! is_array( $payload['custom'] ) ) {
    $payload['custom'] = [];
  }
  $payload['custom']['discord'] = $discord_id ?: null;

  return $payload;
}, 10, 4 );