--  Orders (item 5): the peaceful orders of 1.2.91 (constants.ts ORDERS;
--  execution.ts estimateMinutes, assignOrder, beginWeekOrders, tickOrders,
--  resolveTarget, finishOrder; crewTime.ts; orderStaffing.ts;
--  collectRoutes.ts; sim.ts failUnfinishedOrders; api.ts rolloverOrders),
--  written fresh.
--
--  Proposed and unproven against 1.2.91 where noted: crews go on foot
--  (cars are item 6), so estimates are 1.2.91's on-foot estimates and men
--  walk the L of Hood.Population.Week; a door is the lot's centre.
with Hood.Random;

package Hood.Population.Orders with Preelaborate is

   type Target_Kind is (On_Building, On_Area, On_Point);

   type Def_Rec is record
      Max_Men    : Integer_32;
      Minutes    : Integer_32;   --  per target
      Target     : Target_Kind;
      Whole_Week : Boolean;      --  a standing duty: the men all week
      Repeatable : Boolean;
      Dangerous  : Boolean;      --  orderStaffing.ts: guard and patrol
      First      : Skill;
      Second     : Skill;
      Two        : Boolean;      --  Second counts
   end record;

   Defs : constant array (Order_Kind) of Def_Rec :=
     [O_Buy           => (2, 250, On_Building, False, False, False, Business, Organization, True),
      O_Set_Up        => (2, 500, On_Building, False, False, False, Business, Organization, True),
      O_Run           => (2, 150, On_Building, False, False, False, Business, Organization, True),
      O_Collect       => (10, 33, On_Area, False, True, False, Intimidation, Intimidation, False),
      O_Adjust        => (1, 20, On_Area, False, False, False, Intimidation, Intimidation, False),
      O_Donate        => (4, 33, On_Building, False, False, False, Intelligence, Intelligence, False),
      O_Clean_Up      => (4, 40, On_Area, False, False, False, Organization, Organization, False),
      O_Clear_Streets => (4, 20, On_Area, False, False, False, Intimidation, Intimidation, False),
      O_Guard         => (4, 0, On_Building, True, False, True, Firearms, Firearms, False),
      O_Patrol        => (4, 0, On_Area, True, True, True, Firearms, Intimidation, True),
      O_Explore       => (10, 17, On_Area, False, False, False, Stealth, Intelligence, True),
      O_Recruit       => (10, 33, On_Area, False, False, False, Intelligence, Intelligence, False),
      O_Go_To         => (4, 0, On_Point, True, False, False, Stealth, Stealth, False)];

   Cleanup_Cost : constant := 50;     --  execution.ts CLEANUP_COST_PER_SITE
   Centre_Lot   : constant := 4;
   Week_Slack   : constant := 2_448;  --  2,400 x 1.02 (crewTime.ts)

   --  An order before it is given: what the player picked.
   type Order_Input is record
      Crew     : Integer_32;   --  crew slot
      Kind     : Order_Kind;
      Manpower : Integer_32;
      Picked_Count : Integer_32;
      Picked   : Target_List;  --  buildings picked one by one
      Block_Count : Integer_32;
      Blocks   : Block_List;
      PX, PY   : Hood.Units.Units;
      Has_Point : Boolean;
      Amount   : Integer_32;   --  -1: none given
      Level    : Integer_32;   --  per cent, -1: none given
      Business : Integer_32;   --  type id or -1
      Front    : Integer_32;   --  building or -1
      Repeat   : Boolean;
   end record;

   No_Input : constant Order_Input :=
     (Crew => No_Id, Kind => O_Explore, Manpower => 1, Picked_Count | Block_Count => 0,
      Picked => [others => No_Id], Blocks => [others => No_Id], PX | PY => 0,
      Has_Point => False, Amount | Level | Business | Front => -1, Repeat => False);

   --  Helpers shared with Hood.Population.Commands.
   function Lieutenant_Ok (S : Population_State; Slot : Integer_32) return Boolean;
   function Members_Count (S : Population_State; Slot : Integer_32) return Integer_32;
   --  crewPeople that are not dead.
   function Crew_Men (S : Population_State; C : Hood.City.City_State; Slot : Integer_32) return Integer_32;
   --  crewMen: those free for orders.
   function Staffing_Reason
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      Kind : Order_Kind; Manpower : Integer_32) return Line_Rec;
   --  orderStaffing while planning: why the crew cannot take it, or No_Line.
   function Free_For_Orders (S : Population_State; C : Hood.City.City_State; P : Integer_32) return Boolean;
   function Valid_Building
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id; Kind : Order_Kind;
      B, Business, Front : Integer_32) return Boolean;
   function Valid_Area
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id; Kind : Order_Kind;
      B : Integer_32) return Boolean;
   function Building_Value (S : Population_State; C : Hood.City.City_State; B : Integer_32) return Integer_32;
   function Donation_Amount (C : Hood.City.City_State; B : Integer_32) return Integer_32;
   function Order_Cost (S : Population_State; C : Hood.City.City_State; O : Order_Rec) return Integer_32;
   function Committed_Cash
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id; Except : Integer_32) return Integer_32;

   procedure Expand
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id; Input : Order_Input;
      Out_List : out Target_List; Count : out Integer_32);
   --  expandTargets: the picked sites, then the valid sites of the blocks.

   procedure Draft
     (S : Population_State; C : Hood.City.City_State; G : Gang_Id;
      Input : Order_Input; Editing : Integer_32; O : out Order_Rec);
   --  previewOrder: the order as it would be given (targets expanded,
   --  collect stops routed, donation amount, estimate); takes no number.
   --  Editing is an order slot whose place is being judged, or No_Id.

   function Estimate
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      O : Order_Rec; Self : Integer_32) return Integer_32;
   --  estimateMinutesOnFoot. Self is the order's slot or No_Id.

   function Has_Time
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      O : Order_Rec; Skip : Integer_32) return Boolean;
   --  crewHasTime: the crew's man-minutes and each man's week (2 % slack).

   procedure Trim_To_Week
     (S : Population_State; C : Hood.City.City_State; Slot : Integer_32;
      O : Order_Rec; Kept : out Target_List; Kept_Count : out Integer_32);
   --  collectRoutes.ts trimToWeek: the stops that save the most walking go
   --  until the rest fit; 0 kept when not one fits.

   procedure Sync_Time (S : in out Population_State; C : Hood.City.City_State; Slot : Integer_32);
   procedure Retime (S : in out Population_State; C : Hood.City.City_State; Slot : Integer_32);
   --  retimeCrew: queued orders re-estimated (planning), then the sync.

   procedure Send_Home (S : in out Population_State; C : Hood.City.City_State; P : Integer_32);

   --  The week.
   procedure Begin_Week (S : in out Population_State; C : Hood.City.City_State);
   procedure Tick
     (S    : in out Population_State;
      C    : in out Hood.City.City_State;
      Main : in out Hood.Random.Mulberry);
   procedure Fail_Unfinished (S : in out Population_State; C : Hood.City.City_State);
   procedure Rollover (S : in out Population_State; C : Hood.City.City_State);

   procedure Report (S : in out Population_State; G : Gang_Ref; Line : Line_Rec);
   --  A message for the player's gang (report (), other gangs' are dropped).

   function Line (Kind : Line_Kind; A, B, C, D : Integer_32 := 0) return Line_Rec is
     ((Kind, A, B, C, D));

end Hood.Population.Orders;
