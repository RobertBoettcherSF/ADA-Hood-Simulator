--  Item 6: the gangs' cars (1.2.91 transport.ts, vehicleNavigation.ts).
--  A crew's riders take a free car when walking to it and driving on is
--  quicker than walking the whole way; trips under 202.5 m are walked.
--  The car waits for its riders, the best driver takes the wheel, and it
--  drives the streets in its lane, giving way to the city's traffic.
--  Written fresh.
with Hood.City;

package Hood.Population.Transport with Preelaborate is

   --  constants.ts VEHICLES (seats, speed) and the costs of buying one.
   function Seats (K : Vehicle_Kind) return Integer_32 is
     (case K is when V_Speedster => 2, when V_Coupe => 4, when V_Truck => 10);
   function Pace (K : Vehicle_Kind) return Long_Float is
     (case K is when V_Speedster => 1.45, when V_Coupe => 1.0, when V_Truck => 0.38);
   function Cost (K : Vehicle_Kind) return Integer_32 is
     (case K is when V_Speedster => 5_000, when V_Coupe => 3_000, when V_Truck => 3_000);

   Walk_Speed  : constant Long_Float := 0.54;   --  1.8 / (10 / 3)
   Drive_Speed : constant Long_Float := 1.836;  --  WALK_SPEED x 3.4
   Drive_Min_Distance : constant Long_Float := 202.5;  --  18.75 x 54 / 5

   function Crew_Cars (S : Population_State; Slot : Integer_32; K : Vehicle_Kind) return Integer_32;
   function Driving (S : Population_State; P : Integer_32) return Long_Float;
   --  Driving skill in stars.

   procedure Base
     (S : Population_State; C : Hood.City.City_State; G : Gang_Ref;
      NX, NY : Long_Float; X, Y : out Long_Float);
   --  The nearest office door (the first on a tie), or the point itself.

   function Find (S : Population_State; Slot : Integer_32; K : Vehicle_Kind; N : Integer_32)
     return Integer_32;
   --  The fleet record of the crew's N-th car of kind K, or No_Id (still
   --  in the garage).
   function Busy (S : Population_State; V : Integer_32) return Boolean;

   Max_Plan_Cars : constant := 16;
   subtype Rider_List is Occupant_List;
   type Plan_Car is record
      Kind   : Vehicle_Kind;
      Slot   : Integer_32;
      Count  : Integer_32;
      Riders : Rider_List;
      Walk   : Long_Float;
   end record;
   type Plan_Cars is array (1 .. Max_Plan_Cars) of Plan_Car;
   type People_List is array (1 .. 10) of Integer_32;
   type Plan is record
      Car_Count    : Integer_32;
      Cars         : Plan_Cars;
      Walker_Count : Integer_32;
      Walkers      : People_List;
   end record;

   procedure Crew_Plan
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      People : People_List; N : Integer_32;
      Has_From : Boolean; FX, FY : Long_Float;
      Has_To : Boolean; TX, TY : Long_Float;
      Result : out Plan);
   --  crewTransportPlan.

   procedure Planned_Travel
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      People : People_List; N : Integer_32;
      Has_From : Boolean; FX, FY : Long_Float;
      Has_To : Boolean; TX, TY : Long_Float;
      Speed, Walk_Minutes : out Long_Float);
   --  plannedTravel: the slowest pace of the party and the longest walk
   --  to a car, in minutes.

   Board_Wait_Minutes : constant := 60;  --  constants.ts BOARD_WAIT_MINUTES
   Stranded_Distance  : constant Long_Float := 25.0;
   Stranded_Minutes   : constant := 60;

   procedure Reconcile (S : in out Population_State; C : Hood.City.City_State);
   --  reconcileTransport: clean up seats, release ended jobs, and send a
   --  free man for a car left standing away from the offices for an hour.
   function No_Car (S : Population_State; Order, P : Integer_32) return Boolean;
   --  He gave up his seat on this order (walks the rest of it).
   procedure Reserve_Crew_Car
     (S : in out Population_State; C : Hood.City.City_State; Slot, Order : Integer_32;
      Car : Plan_Car; TX, TY : Long_Float);
   --  makeVehicle and reserve: the car is held for its riders.

   procedure Set_Destination
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32; TX, TY : Long_Float);
   --  movement.ts setDestination: on foot, or at the wheel along the
   --  streets (a passenger only follows his driver).
   function Step_Person
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32;
      Traffic : Boolean) return Boolean;
   --  movement.ts stepPerson with the car's bookkeeping (afterTransportStep).

   procedure Dismount (S : in out Population_State; I : Integer_32);
   procedure Alight (S : in out Population_State; C : Hood.City.City_State; I : Integer_32);
   --  Out of the car (or out of a reservation on one) onto the pavement.
   procedure Release_Order (S : in out Population_State; Order : Integer_32);
   procedure Reset_Week (S : in out Population_State; C : Hood.City.City_State);
   --  resetWeekTransport: empty cars at the offices go back to the
   --  garage; one left out on the streets keeps its place.
   procedure Send_Home
     (S : in out Population_State; C : Hood.City.City_State; I : Integer_32; HX, HY : Long_Float);
   --  sendHome's car part: a man at the wheel drives to a parking spot by
   --  (HX, HY); anyone else gets out and walks there.
   procedure Drop_Crew (S : in out Population_State; Slot : Integer_32);
   --  A crew disbanded: its cars leave the streets.
   function Sync_Count return Integer_32;
   --  Boardings so far (a check).

end Hood.Population.Transport;
