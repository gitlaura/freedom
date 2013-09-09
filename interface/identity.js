fdom.apis.set("identity", {
  //e.g. var id = identity.id
  'id': {type: "property", value: "string"},
  //Log into the network
  //e.g. login(String agent, String version, String url)
  //Returns nothing
  'login': {type: "method", value: ["string", "string", "string"]},
  //Gets the profile of a user
  //If id is null, return self
  //e.g. identity.getProfile(String id);
  //Returns {
  //  'me': {
  //    'userMe1': {                //Must internal 'userId'
  //    ' userId': 'string',        //ID (e.g. alice@gmail.com) username
  //      'name': 'string',         //Name (e.g. Alice Underpants)
  //      'url': 'string',          //Homepage URL
  //      'clients': {
  //        'client1': {              //Array of clients (NOTE: key must match 'clientId' in card)
  //          'clientId': 'string',   //ID of client (e.g. alice@gmail.com/Android-23nadsv32f)
  //          'network': 'string',    //Name of network
  //          'status': 'string'      //Status (['messageable', 'online', 'offline'])
  //        }, 
  //        'client2': ...
  //      }
  //    },
  //    'userMe2': ...
  //  },
  //  'roster': {                 //List of friends
  //    'user1': {                //NOTE: Key must match 'userId' in user card
  //      'userId': 'string',
  //      'name': 'string',
  //      'url': string,
  //      'clients': {
  //        'client1': {          //NOTE: Key must match 'clientId' in client card
  //          'clientId': 'string',
  //          'network': 'string'
  //          'status': 'string'
  //        },
  //        'client2': ...
  //      }
  //    },
  //    'user2': ...
  //  }
  //}
  'getProfile': {type: "method", value: ["string"]},
  //Send a message to user on your network
  //e.g. sendMessage(String destination_id, String message)
  //Returns nothing
  'sendMessage': {type: "method", value: ["string", "string"]},
  //Logs out of the network associated with the given userId
  //If userId is null, log out of all networks
  //e.g. logout(String userId)
  //Returns {
  //  'userId': 'string',
  //  'success': 'boolean',
  //  'message': 'string'
  //}
  'logout': {type: "method", value: ["string"]},
  //Event on change in profile
  //(includes changes to roster)
  'onChange': {type: "event", value: {
    'userId': 'string',
    'name': 'string',
    'url': 'string',
    'clients': 'object'
  }},
  //Event on incoming message
  'onMessage': {type: "event", value: {
    "fromUserId": "string",   //userId of user message is from
    "fromClientId": "string", //clientId of user message is from
    "toUserId": "string",     //userId of user message is to
    "toClientId": "string",   //clientId of user message is to
    "message": "object"       //message contents
  }},
  //Event on provider status
  //Can be 'offline', 'online', 'authenticating', 'connecting' or 'error'
  'onStatus': {type: "event", value: {
    "userId": "string", //userId of network this is about
    "network": "string",//name of the network (chosen by identity provider)
    "status": "string", //One of the above statuses
    "message": "string" //More detailed message about status
  }}
});

